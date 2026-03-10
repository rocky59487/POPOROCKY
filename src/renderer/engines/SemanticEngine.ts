/**
 * SemanticEngine - 語意引擎
 * 
 * 人類語言→機器指令轉換，模糊匹配 (Fuzzy Matching)，
 * 使用 Levenshtein 距離進行命令解析。
 */

import signalBus, { SIGNALS } from './EventBus';

interface ParsedCommand {
  action: string;
  type: string;
  target: string;
  confidence: number;
  params: Record<string, any>;
}

// Command dictionary for fuzzy matching
const COMMAND_DICTIONARY: Record<string, { action: string; type: string; aliases: string[] }> = {
  'place': { action: 'place', type: 'voxel', aliases: ['put', 'add', 'mk', 'make', 'create', 'build', '放置', '新增', '建造'] },
  'delete': { action: 'delete', type: 'voxel', aliases: ['remove', 'rm', 'del', 'erase', '刪除', '移除'] },
  'select': { action: 'select', type: 'voxel', aliases: ['pick', 'sel', 'choose', '選取', '選擇'] },
  'arc': { action: 'create', type: 'arc', aliases: ['curve', 'bend', '弧', '曲線'] },
  'line': { action: 'create', type: 'line', aliases: ['straight', '線', '直線'] },
  'fillet': { action: 'tag', type: 'fillet_R', aliases: ['round', 'radius', '圓角', '倒角'] },
  'sharp': { action: 'tag', type: 'sharp', aliases: ['edge', 'corner', '銳利', '尖角'] },
  'smooth': { action: 'tag', type: 'smooth_curve', aliases: ['soft', 'gentle', '平滑', '柔和'] },
  'export': { action: 'export', type: 'rhino', aliases: ['save', 'output', '匯出', '輸出'] },
  'convert': { action: 'convert', type: 'nurbs', aliases: ['transform', 'nurbs', '轉換'] },
  'undo': { action: 'undo', type: 'action', aliases: ['back', 'revert', '復原', '撤銷'] },
};

export class SemanticEngine {
  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    // Listen for raw text input
    signalBus.subscribe('raw_command_input', (payload: { text: string }) => {
      const parsed = this.parseCommand(payload.text);
      signalBus.publish(SIGNALS.CMD_PARSED, parsed);
    });
  }

  /**
   * Levenshtein 距離計算
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  /**
   * 模糊匹配命令
   */
  private fuzzyMatch(input: string): { key: string; confidence: number } | null {
    const normalizedInput = input.toLowerCase().trim();
    let bestMatch: { key: string; confidence: number } | null = null;

    for (const [key, cmd] of Object.entries(COMMAND_DICTIONARY)) {
      // Check exact match
      if (normalizedInput === key) {
        return { key, confidence: 1.0 };
      }

      // Check aliases
      for (const alias of cmd.aliases) {
        if (normalizedInput === alias.toLowerCase()) {
          return { key, confidence: 0.95 };
        }
      }

      // Fuzzy match using Levenshtein distance
      const allTerms = [key, ...cmd.aliases];
      for (const term of allTerms) {
        const distance = this.levenshteinDistance(normalizedInput, term.toLowerCase());
        const maxLen = Math.max(normalizedInput.length, term.length);
        const similarity = 1 - distance / maxLen;

        if (similarity > 0.6 && (!bestMatch || similarity > bestMatch.confidence)) {
          bestMatch = { key, confidence: similarity };
        }
      }
    }

    return bestMatch;
  }

  /**
   * 解析命令文字
   */
  parseCommand(text: string): ParsedCommand {
    const tokens = text.trim().split(/\s+/);
    const mainToken = tokens[0] || '';
    const match = this.fuzzyMatch(mainToken);

    if (!match) {
      return {
        action: 'unknown',
        type: 'unknown',
        target: text,
        confidence: 0,
        params: {},
      };
    }

    const cmd = COMMAND_DICTIONARY[match.key];
    const params: Record<string, any> = {};

    // Parse additional parameters
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      // Try to parse as number
      const num = parseFloat(token);
      if (!isNaN(num)) {
        if (!params.values) params.values = [];
        params.values.push(num);
      } else {
        // Try to parse as coordinate
        const coordMatch = token.match(/^(\d+),(\d+),(\d+)$/);
        if (coordMatch) {
          params.position = [
            parseInt(coordMatch[1]),
            parseInt(coordMatch[2]),
            parseInt(coordMatch[3]),
          ];
        } else {
          params.target = token;
        }
      }
    }

    const result: ParsedCommand = {
      action: cmd.action,
      type: cmd.type,
      target: params.target || '',
      confidence: match.confidence,
      params,
    };

    signalBus.publish(SIGNALS.LOG_MESSAGE, {
      level: 'info',
      source: 'SemanticEngine',
      message: `命令解析: "${text}" → ${result.action}:${result.type} (信心度: ${(result.confidence * 100).toFixed(0)}%)`,
    });

    return result;
  }
}

export const semanticEngine = new SemanticEngine();
export default semanticEngine;
