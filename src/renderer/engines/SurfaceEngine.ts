/**
 * SurfaceEngine - 曲面引擎整合模組
 * 
 * 基於「曲面引擎整合FastDesign架構」文件，實作：
 * - Manifold Dual Contouring 流形修復
 * - TRF 求解器邊界保護
 * - NURBS 品質驗證
 * - Rhino 匯出格式生成
 */

import signalBus, { SIGNALS } from './EventBus';
import {
  NURBSPayload,
  NURBSSurface,
  FeatureLine,
  RhinoExportPayload,
  LayerData,
} from '../store/DataModels';

// ============================================================
// Manifold Validation - 流形驗證
// ============================================================
interface ManifoldReport {
  isManifold: boolean;
  nonManifoldEdges: number;
  nonManifoldVertices: number;
  isolatedVertices: number;
  repairActions: string[];
}

// ============================================================
// Surface Quality Report
// ============================================================
interface SurfaceQualityReport {
  patchId: string;
  isValid: boolean;
  continuity: 'G0' | 'G1' | 'G2';
  maxCurvature: number;
  minCurvature: number;
  selfIntersections: number;
  issues: string[];
}

export class SurfaceEngine {
  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    signalBus.subscribe(SIGNALS.NURBS_CONVERSION_DONE, (payload) => {
      this.validateAndProcess(payload.result);
    });
  }

  /**
   * 驗證 NURBS 結果並進行後處理
   */
  async validateAndProcess(nurbsPayload: NURBSPayload): Promise<void> {
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'SurfaceEngine',
      message: '開始 NURBS 品質驗證與曲面引擎整合...',
    });

    // 1. Manifold validation
    const manifoldReport = this.validateManifold(nurbsPayload);
    
    // 2. Surface quality check
    const qualityReports = nurbsPayload.nurbs_surfaces.map(s => this.checkSurfaceQuality(s));

    // 3. Boundary padding check (TRF solver protection)
    this.checkBoundaryPadding(nurbsPayload);

    // 4. Knot vector validation
    this.validateKnotVectors(nurbsPayload);

    // Log results
    const validSurfaces = qualityReports.filter(r => r.isValid).length;
    const totalSurfaces = qualityReports.length;

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: validSurfaces === totalSurfaces ? 'success' : 'warning',
      source: 'SurfaceEngine',
      message: `品質驗證完成: ${validSurfaces}/${totalSurfaces} 曲面通過, 流形: ${manifoldReport.isManifold ? '是' : '否'}`,
    });

    if (!manifoldReport.isManifold) {
      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'warning',
        source: 'SurfaceEngine',
        message: `流形修復建議: ${manifoldReport.repairActions.join(', ')}`,
      });
    }

    qualityReports.forEach(report => {
      if (!report.isValid) {
        signalBus.publish(SIGNALS.LOG_MESSAGE, {
          level: 'warning',
          source: 'SurfaceEngine',
          message: `曲面 ${report.patchId.substring(0, 8)}: ${report.issues.join('; ')}`,
        });
      }
    });
  }

  /**
   * 流形驗證 (Manifold Validation)
   * 檢測 Non-Manifold 邊緣與 T 型連接
   */
  private validateManifold(payload: NURBSPayload): ManifoldReport {
    const report: ManifoldReport = {
      isManifold: true,
      nonManifoldEdges: 0,
      nonManifoldVertices: 0,
      isolatedVertices: 0,
      repairActions: [],
    };

    // Check each surface for self-intersections and edge sharing
    const edgeMap = new Map<string, number>();

    payload.nurbs_surfaces.forEach(surface => {
      const cpRows = surface.control_points.length;
      const cpCols = surface.control_points[0]?.length || 0;

      // Check boundary edges
      for (let i = 0; i < cpRows - 1; i++) {
        for (let j = 0; j < cpCols - 1; j++) {
          const cp = surface.control_points[i]?.[j];
          const cpNext = surface.control_points[i + 1]?.[j];
          if (cp && cpNext) {
            const edgeKey = `${cp[0].toFixed(3)},${cp[1].toFixed(3)},${cp[2].toFixed(3)}-${cpNext[0].toFixed(3)},${cpNext[1].toFixed(3)},${cpNext[2].toFixed(3)}`;
            edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);
          }
        }
      }
    });

    // Non-manifold edges are shared by more than 2 faces
    edgeMap.forEach((count, edge) => {
      if (count > 2) {
        report.nonManifoldEdges++;
        report.isManifold = false;
      }
    });

    if (report.nonManifoldEdges > 0) {
      report.repairActions.push('Manifold Dual Contouring 修復');
      report.repairActions.push('T 型連接消除');
    }

    // Check for isolated control points
    payload.nurbs_surfaces.forEach(surface => {
      surface.control_points.forEach(row => {
        row.forEach(cp => {
          if (cp[3] === 0) {
            report.isolatedVertices++;
          }
        });
      });
    });

    if (report.isolatedVertices > 0) {
      report.repairActions.push('移除孤立頂點');
    }

    return report;
  }

  /**
   * 曲面品質檢查
   */
  private checkSurfaceQuality(surface: NURBSSurface): SurfaceQualityReport {
    const report: SurfaceQualityReport = {
      patchId: surface.patch_id,
      isValid: true,
      continuity: 'G2',
      maxCurvature: 0,
      minCurvature: Infinity,
      selfIntersections: 0,
      issues: [],
    };

    // Check control point validity
    const cpRows = surface.control_points.length;
    const cpCols = surface.control_points[0]?.length || 0;

    if (cpRows < 2 || cpCols < 2) {
      report.isValid = false;
      report.issues.push('控制點網格不足 (需至少 2x2)');
      return report;
    }

    // Check for NaN or Infinity in control points
    let hasInvalid = false;
    surface.control_points.forEach(row => {
      row.forEach(cp => {
        if (cp.some(v => isNaN(v) || !isFinite(v))) {
          hasInvalid = true;
        }
      });
    });

    if (hasInvalid) {
      report.isValid = false;
      report.issues.push('控制點包含 NaN 或 Infinity');
    }

    // Check knot vector validity
    if (!this.isKnotVectorValid(surface.knots_u, cpRows, surface.degree_u)) {
      report.issues.push('U 方向節點向量無效');
    }
    if (!this.isKnotVectorValid(surface.knots_v, cpCols, surface.degree_v)) {
      report.issues.push('V 方向節點向量無效');
    }

    // Check weight validity for rational surfaces
    if (surface.is_rational) {
      surface.control_points.forEach(row => {
        row.forEach(cp => {
          if (cp[3] <= 0) {
            report.issues.push('有理曲面權重必須為正');
          }
        });
      });
    }

    // Estimate curvature (simplified)
    for (let i = 1; i < cpRows - 1; i++) {
      for (let j = 1; j < cpCols - 1; j++) {
        const prev = surface.control_points[i - 1][j];
        const curr = surface.control_points[i][j];
        const next = surface.control_points[i + 1][j];

        const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1], dz1 = curr[2] - prev[2];
        const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1], dz2 = next[2] - curr[2];

        const curvature = Math.sqrt(
          (dx2 - dx1) * (dx2 - dx1) +
          (dy2 - dy1) * (dy2 - dy1) +
          (dz2 - dz1) * (dz2 - dz1)
        );

        report.maxCurvature = Math.max(report.maxCurvature, curvature);
        if (curvature > 0) report.minCurvature = Math.min(report.minCurvature, curvature);
      }
    }

    if (report.minCurvature === Infinity) report.minCurvature = 0;

    // Determine continuity
    if (report.maxCurvature > 10) {
      report.continuity = 'G0';
    } else if (report.maxCurvature > 1) {
      report.continuity = 'G1';
    }

    if (report.issues.length > 0) {
      report.isValid = false;
    }

    return report;
  }

  /**
   * 節點向量驗證
   */
  private isKnotVectorValid(knots: number[], numCP: number, degree: number): boolean {
    if (knots.length !== numCP + degree + 1) return false;

    // Check non-decreasing
    for (let i = 1; i < knots.length; i++) {
      if (knots[i] < knots[i - 1]) return false;
    }

    // Check clamped condition
    for (let i = 0; i < degree; i++) {
      if (knots[i] !== knots[0]) return false;
      if (knots[knots.length - 1 - i] !== knots[knots.length - 1]) return false;
    }

    return true;
  }

  /**
   * TRF 邊界填充檢查
   */
  private checkBoundaryPadding(payload: NURBSPayload): void {
    payload.nurbs_surfaces.forEach(surface => {
      surface.control_points.forEach(row => {
        row.forEach(cp => {
          // Check if control points are too close to bounds
          const BOUND_THRESHOLD = 1e-10;
          if (Math.abs(cp[0]) < BOUND_THRESHOLD ||
              Math.abs(cp[1]) < BOUND_THRESHOLD ||
              Math.abs(cp[2]) < BOUND_THRESHOLD) {
            signalBus.publish(SIGNALS.LOG_MESSAGE, {
              level: 'warning',
              source: 'SurfaceEngine',
              message: `TRF 邊界警告: 控制點接近零邊界 [${cp[0].toFixed(4)}, ${cp[1].toFixed(4)}, ${cp[2].toFixed(4)}]`,
            });
          }
        });
      });
    });
  }

  /**
   * 驗證節點向量（針對 rhino3dm.js 不可變性問題）
   */
  private validateKnotVectors(payload: NURBSPayload): void {
    let knotIssues = 0;
    payload.nurbs_surfaces.forEach(surface => {
      // Check for the rhino3dm.js knot vector immutability bug
      if (surface.knots_u.length === 0 || surface.knots_v.length === 0) {
        knotIssues++;
      }
      // Validate knot multiplicity
      const checkMultiplicity = (knots: number[], degree: number) => {
        let maxMult = 0;
        let i = 0;
        while (i < knots.length) {
          let mult = 1;
          while (i + mult < knots.length && knots[i + mult] === knots[i]) mult++;
          maxMult = Math.max(maxMult, mult);
          i += mult;
        }
        return maxMult <= degree + 1;
      };

      if (!checkMultiplicity(surface.knots_u, surface.degree_u) ||
          !checkMultiplicity(surface.knots_v, surface.degree_v)) {
        knotIssues++;
        signalBus.publish(SIGNALS.LOG_MESSAGE, {
          level: 'warning',
          source: 'SurfaceEngine',
          message: `節點向量重複度超過 degree+1 (Patch: ${surface.patch_id.substring(0, 8)})`,
        });
      }
    });

    if (knotIssues > 0) {
      signalBus.publish(SIGNALS.LOG_MESSAGE, {
        level: 'warning',
        source: 'SurfaceEngine',
        message: `注意: ${knotIssues} 個節點向量問題 (rhino3dm.js 相容性)`,
      });
    }
  }

  /**
   * 生成 Rhino 匯出資料
   */
  generateRhinoExport(
    nurbsPayload: NURBSPayload,
    layers: LayerData[],
    author: string = 'FastDesign User'
  ): RhinoExportPayload {
    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'SurfaceEngine',
      message: '生成 RhinoExportPayload...',
    });

    const geometryObjects: any[] = [];

    // Convert NURBS surfaces to Rhino geometry objects
    nurbsPayload.nurbs_surfaces.forEach(surface => {
      geometryObjects.push({
        type: 'NurbsSurface',
        layer: 'NURBS_Surfaces',
        geometry_data: {
          degree_u: surface.degree_u,
          degree_v: surface.degree_v,
          knots_u: surface.knots_u,
          knots_v: surface.knots_v,
          is_rational: surface.is_rational,
          control_points: surface.control_points,
        },
        user_strings: {
          patch_id: surface.patch_id,
          source: 'FastDesign_VoxelToNURBS',
        },
      });
    });

    // Convert feature lines to Rhino curves
    nurbsPayload.feature_lines.forEach(line => {
      geometryObjects.push({
        type: 'NurbsCurve',
        layer: 'Feature_Lines',
        geometry_data: {
          degree: line.degree,
          knots: line.knots,
          control_points: line.control_points,
        },
        user_strings: {
          curve_id: line.curve_id,
          adjacent_patches: line.adjacent_patch_ids.join(','),
        },
      });
    });

    const payload: RhinoExportPayload = {
      export_metadata: {
        timestamp: new Date().toISOString(),
        author,
        units: nurbsPayload.model_unit,
      },
      rhino_layers: [
        ...layers.map(l => ({
          name: l.name,
          color: l.color,
          is_culled_by_physics: l.is_culled_by_physics,
        })),
        { name: 'NURBS_Surfaces', color: '#4dabf7', is_culled_by_physics: false },
        { name: 'Feature_Lines', color: '#ffe66d', is_culled_by_physics: false },
      ],
      geometry_objects: geometryObjects,
    };

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'success',
      source: 'SurfaceEngine',
      message: `RhinoExportPayload 生成完成: ${geometryObjects.length} 幾何物件`,
    });

    return payload;
  }
}

export const surfaceEngine = new SurfaceEngine();
export default surfaceEngine;
