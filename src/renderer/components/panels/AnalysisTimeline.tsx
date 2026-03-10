import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore, FEAResult } from '../../store/useStore';
import { Play, Pause, ChevronDown, ChevronRight, Clock, SkipBack, SkipForward, Trash2 } from 'lucide-react';

interface TimelineEntry {
  id: string;
  timestamp: number;
  maxStressRatio: number;
  dangerCount: number;
  totalEdges: number;
  result: FEAResult;
}

export function AnalysisTimeline() {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setFEAResult = useStore(s => s.setFEAResult);
  const feaResult = useStore(s => s.loadAnalysis.result);
  const addLog = useStore(s => s.addLog);

  // Listen for new FEA results
  useEffect(() => {
    if (!feaResult || feaResult.totalEdges === 0) return;
    // Check if this result is already recorded (avoid duplicates)
    const lastEntry = entries[entries.length - 1];
    if (lastEntry && lastEntry.totalEdges === feaResult.totalEdges &&
        Math.abs(lastEntry.maxStressRatio - feaResult.maxStressRatio) < 0.001) return;

    const newEntry: TimelineEntry = {
      id: `fea_${Date.now()}`,
      timestamp: Date.now(),
      maxStressRatio: feaResult.maxStressRatio,
      dangerCount: feaResult.dangerCount,
      totalEdges: feaResult.totalEdges,
      result: JSON.parse(JSON.stringify(feaResult)),
    };
    setEntries(prev => [...prev, newEntry]);
    setActiveIdx(entries.length);
  }, [feaResult]);

  const selectEntry = useCallback((idx: number) => {
    if (idx < 0 || idx >= entries.length) return;
    setActiveIdx(idx);
    const entry = entries[idx];
    // Restore the FEA result from this snapshot
    const restored: FEAResult = {
      ...entry.result,
      displacements: new Map(),
    };
    setFEAResult(restored);
    addLog('info', 'Timeline', `已切換至分析快照 #${idx + 1} (${new Date(entry.timestamp).toLocaleTimeString()})`);
  }, [entries, setFEAResult, addLog]);

  const togglePlay = useCallback(() => {
    if (entries.length < 2) return;
    setIsPlaying(prev => !prev);
  }, [entries]);

  useEffect(() => {
    if (!isPlaying || entries.length < 2) {
      if (playRef.current) clearInterval(playRef.current);
      playRef.current = null;
      return;
    }

    let idx = activeIdx < 0 ? 0 : activeIdx;
    playRef.current = setInterval(() => {
      idx = (idx + 1) % entries.length;
      selectEntry(idx);
      if (idx === entries.length - 1) {
        setIsPlaying(false);
      }
    }, 1500);

    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [isPlaying, entries.length, activeIdx, selectEntry]);

  const clearTimeline = () => {
    setEntries([]);
    setActiveIdx(-1);
    setIsPlaying(false);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getStressColor = (ratio: number) => {
    if (ratio > 1.0) return '#f85149';
    if (ratio > 0.8) return '#d29922';
    if (ratio > 0.5) return '#e3b341';
    return '#3fb950';
  };

  return (
    <div className="glass-panel" style={{ marginTop: 4 }}>
      <div
        className="panel-header"
        style={{ cursor: 'pointer' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={12} /> 分析時間軸
          {entries.length > 0 && (
            <span style={{
              fontSize: 9, background: 'var(--accent)', color: '#000',
              padding: '0 5px', borderRadius: 8, fontWeight: 600,
            }}>
              {entries.length}
            </span>
          )}
        </span>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </div>
      {isOpen && (
        <div className="panel-body" style={{ padding: '4px 6px' }}>
          {entries.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: 8, textAlign: 'center' }}>
              尚無分析記錄。執行 ANALYZE 指令後會自動記錄。
            </div>
          ) : (
            <>
              {/* Playback controls */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                <button
                  className="tool-btn"
                  onClick={() => selectEntry(Math.max(0, activeIdx - 1))}
                  disabled={activeIdx <= 0}
                  style={{ padding: '3px 6px' }}
                >
                  <SkipBack size={10} />
                </button>
                <button
                  className={`tool-btn ${isPlaying ? 'active' : ''}`}
                  onClick={togglePlay}
                  disabled={entries.length < 2}
                  style={{ padding: '3px 6px' }}
                >
                  {isPlaying ? <Pause size={10} /> : <Play size={10} />}
                </button>
                <button
                  className="tool-btn"
                  onClick={() => selectEntry(Math.min(entries.length - 1, activeIdx + 1))}
                  disabled={activeIdx >= entries.length - 1}
                  style={{ padding: '3px 6px' }}
                >
                  <SkipForward size={10} />
                </button>
                <span style={{ flex: 1, fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {activeIdx >= 0 ? `#${activeIdx + 1} / ${entries.length}` : `${entries.length} 筆記錄`}
                </span>
                <button
                  className="tool-btn"
                  onClick={clearTimeline}
                  style={{ padding: '3px 6px' }}
                  title="清除時間軸"
                >
                  <Trash2 size={10} />
                </button>
              </div>

              {/* Timeline bar */}
              <div style={{
                display: 'flex', gap: 1, marginBottom: 6, height: 20,
                background: 'rgba(0,0,0,0.3)', borderRadius: 4, overflow: 'hidden',
              }}>
                {entries.map((entry, i) => (
                  <div
                    key={entry.id}
                    onClick={() => selectEntry(i)}
                    style={{
                      flex: 1, cursor: 'pointer',
                      background: i === activeIdx
                        ? getStressColor(entry.maxStressRatio)
                        : `${getStressColor(entry.maxStressRatio)}33`,
                      transition: 'background 0.2s',
                      borderLeft: i === activeIdx ? '2px solid #fff' : 'none',
                      borderRight: i === activeIdx ? '2px solid #fff' : 'none',
                    }}
                    title={`#${i + 1}: 最大應力比 ${entry.maxStressRatio.toFixed(3)}`}
                  />
                ))}
              </div>

              {/* Entry list */}
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                {entries.map((entry, i) => (
                  <div
                    key={entry.id}
                    onClick={() => selectEntry(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 6px', borderRadius: 3, cursor: 'pointer',
                      fontSize: 10, marginBottom: 1,
                      background: i === activeIdx ? 'rgba(88,166,255,0.1)' : 'transparent',
                      border: i === activeIdx ? '1px solid rgba(88,166,255,0.2)' : '1px solid transparent',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', minWidth: 16 }}>#{i + 1}</span>
                    <span style={{ color: 'var(--text-secondary)', minWidth: 55 }}>{formatTime(entry.timestamp)}</span>
                    <span style={{
                      color: getStressColor(entry.maxStressRatio), fontWeight: 600, minWidth: 40,
                    }}>
                      {entry.maxStressRatio.toFixed(3)}
                    </span>
                    <span style={{ color: entry.dangerCount > 0 ? '#f85149' : 'var(--text-muted)', fontSize: 9 }}>
                      {entry.dangerCount > 0 ? `${entry.dangerCount} 危險` : '安全'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
