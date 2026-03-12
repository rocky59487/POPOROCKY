/**
 * CommandLine - AutoCAD-style Command Line Interface
 * Features:
 * - Interactive multi-step command prompts ("指定第一點：")
 * - Absolute coordinates (5,3,0), relative (@3,2,0), polar (@5<45)
 * - Fuse.js fuzzy search for autocomplete
 * - Ctrl+R history search
 * - Bottom-fixed 120px panel: history output + input with prompt
 * 
 * v2.1: AutoCAD-style interactive command flow
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Fuse from 'fuse.js';
import { commandEngine, CommandResult, CommandDef } from '../engines/CommandEngine';
import { ChevronRight, Terminal, ChevronUp, ChevronDown, Search } from 'lucide-react';
import eventBus from '../engines/EventBus';

/* ─── Fuse.js fuzzy search setup ─── */
const allCommands = commandEngine.getAllCommands();
const fuse = new Fuse(allCommands, {
  keys: ['name', 'syntax', 'description', 'category'],
  threshold: 0.4,
  includeScore: true,
});

interface HistoryLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'success' | 'prompt';
  text: string;
  timestamp: number;
}

/* ─── Interactive Command Session ─── */
interface CommandSession {
  commandName: string;
  step: number;
  prompts: string[];
  collectedArgs: string[];
  lastPoint?: { x: number; y: number; z: number };
}

let lineIdCounter = 0;

/* ─── Coordinate Parser ─── */
function parseCoordinate(input: string, lastPoint?: { x: number; y: number; z: number }): { x: number; y: number; z: number } | null {
  const trimmed = input.trim();

  // Relative polar: @distance<angle
  if (trimmed.startsWith('@') && trimmed.includes('<')) {
    const parts = trimmed.slice(1).split('<');
    const dist = parseFloat(parts[0]);
    const angle = parseFloat(parts[1]) * (Math.PI / 180);
    if (isNaN(dist) || isNaN(angle)) return null;
    const base = lastPoint || { x: 0, y: 0, z: 0 };
    return {
      x: Math.round((base.x + dist * Math.cos(angle)) * 100) / 100,
      y: base.y,
      z: Math.round((base.z + dist * Math.sin(angle)) * 100) / 100,
    };
  }

  // Relative coordinate: @x,y,z
  if (trimmed.startsWith('@')) {
    const parts = trimmed.slice(1).split(',').map(Number);
    if (parts.length < 2 || parts.some(isNaN)) return null;
    const base = lastPoint || { x: 0, y: 0, z: 0 };
    return {
      x: base.x + (parts[0] || 0),
      y: base.y + (parts[1] || 0),
      z: base.z + (parts[2] || 0),
    };
  }

  // Absolute coordinate: x,y,z
  const parts = trimmed.split(',').map(Number);
  if (parts.length >= 2 && !parts.some(isNaN)) {
    return { x: parts[0], y: parts[1] || 0, z: parts[2] || 0 };
  }

  return null;
}

/* ─── Interactive command definitions ─── */
const INTERACTIVE_COMMANDS: Record<string, { prompts: string[]; buildCommand: (args: string[]) => string }> = {
  LINE: {
    prompts: ['指定第一點：', '指定下一點（Enter 結束）：'],
    buildCommand: (args: string[]) => {
      // LINE creates voxels along a line between two points
      if (args.length >= 2) {
        const p1 = parseCoordinate(args[0]);
        const p2 = parseCoordinate(args[1], p1 || undefined);
        if (p1 && p2) {
          return `BOX ${Math.min(p1.x, p2.x)} ${Math.min(p1.y, p2.y)} ${Math.min(p1.z, p2.z)} ${Math.abs(p2.x - p1.x) + 1} ${Math.abs(p2.y - p1.y) + 1} ${Math.abs(p2.z - p1.z) + 1}`;
        }
      }
      return '';
    },
  },
  RECT: {
    prompts: ['指定第一個角點：', '指定對角點：'],
    buildCommand: (args: string[]) => {
      if (args.length >= 2) {
        const p1 = parseCoordinate(args[0]);
        const p2 = parseCoordinate(args[1], p1 || undefined);
        if (p1 && p2) {
          const sx = Math.min(p1.x, p2.x), sy = Math.min(p1.y, p2.y), sz = Math.min(p1.z, p2.z);
          const w = Math.abs(p2.x - p1.x) + 1, h = Math.max(1, Math.abs(p2.y - p1.y) + 1), d = Math.abs(p2.z - p1.z) + 1;
          return `BOX ${sx} ${sy} ${sz} ${w} ${h} ${d}`;
        }
      }
      return '';
    },
  },
  CIRCLE: {
    prompts: ['指定圓心：', '指定半徑：'],
    buildCommand: (args: string[]) => {
      if (args.length >= 2) {
        const center = parseCoordinate(args[0]);
        const radius = parseFloat(args[1]);
        if (center && !isNaN(radius)) {
          return `SPHERE ${center.x} ${center.y} ${center.z} ${radius}`;
        }
      }
      return '';
    },
  },
  MOVE: {
    prompts: ['指定基點：', '指定位移量（或第二點）：'],
    buildCommand: (args: string[]) => {
      if (args.length >= 2) {
        const base = parseCoordinate(args[0]);
        const disp = parseCoordinate(args[1], base || undefined);
        if (base && disp) {
          const dx = disp.x - base.x, dy = disp.y - base.y, dz = disp.z - base.z;
          return `MOVE ${dx} ${dy} ${dz}`;
        }
      }
      return '';
    },
  },
  COPY: {
    prompts: ['指定基點：', '指定位移量（或第二點）：'],
    buildCommand: (args: string[]) => {
      if (args.length >= 2) {
        const base = parseCoordinate(args[0]);
        const disp = parseCoordinate(args[1], base || undefined);
        if (base && disp) {
          const dx = disp.x - base.x, dy = disp.y - base.y, dz = disp.z - base.z;
          return `COPY ${dx} ${dy} ${dz}`;
        }
      }
      return '';
    },
  },
};

export function CommandLine() {
  const [input, setInput] = useState('');
  const [historyLines, setHistoryLines] = useState<HistoryLine[]>([
    { id: lineIdCounter++, type: 'output', text: 'FastDesign v2.1 — 輸入 HELP 查看所有指令', timestamp: Date.now() },
    { id: lineIdCounter++, type: 'output', text: '支援座標輸入：絕對(5,3,0) 相對(@3,2,0) 極座標(@5<45)', timestamp: Date.now() },
  ]);
  const [suggestions, setSuggestions] = useState<CommandDef[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [paramHint, setParamHint] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [cmdHistoryStack, setCmdHistoryStack] = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Interactive command session
  const [session, setSession] = useState<CommandSession | null>(null);

  // History search state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchSelectedIdx, setSearchSelectedIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Current prompt text
  const promptText = session ? session.prompts[session.step] || '命令：' : '命令：';

  // Auto-scroll history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [historyLines]);

  // Global hotkey: backtick or colon to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '`' || e.key === ':') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsExpanded(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Listen for external log events
  useEffect(() => {
    const handler = (data: { type: string; source: string; message: string }) => {
      const type = data.type === 'error' ? 'error' : data.type === 'success' ? 'success' : 'output';
      addLine(type as HistoryLine['type'], `[${data.source}] ${data.message}`);
    };
    eventBus.on('log:add', handler);
    return () => { eventBus.off('log:add', handler); };
  }, []);

  // Update search results when query changes
  useEffect(() => {
    if (!searchMode || !searchQuery.trim()) {
      setSearchResults(cmdHistoryStack);
      setSearchSelectedIdx(0);
      return;
    }
    const q = searchQuery.toLowerCase();
    const filtered = cmdHistoryStack.filter((c: string) => c.toLowerCase().includes(q));
    setSearchResults(filtered);
    setSearchSelectedIdx(0);
  }, [searchQuery, searchMode, cmdHistoryStack]);

  // Update suggestions using Fuse.js as user types
  useEffect(() => {
    if (session) {
      setSuggestions([]);
      setParamHint('');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      setSuggestions([]);
      setParamHint('');
      setSelectedSuggestion(-1);
      return;
    }

    const parts = trimmed.split(/\s+/);
    const cmdPart = parts[0].toUpperCase();

    if (parts.length === 1) {
      const exact = commandEngine.getCommandByName(cmdPart);
      if (exact) {
        setParamHint(exact.syntax);
        if (exact.name.toUpperCase() === cmdPart) {
          setSuggestions([]);
          setSelectedSuggestion(-1);
          return;
        }
      }

      const results = fuse.search(cmdPart).slice(0, 8).map((r: Fuse.FuseResult<CommandDef>) => r.item);
      if (showSuggestions) {
        setSuggestions(results);
        setSelectedSuggestion(results.length > 0 ? 0 : -1);
      }

      if (!exact && results.length > 0) {
        setParamHint(results[0].syntax);
      } else if (!exact) {
        setParamHint('');
      }
    } else {
      setSuggestions([]);
      const cmd = commandEngine.getCommandByName(cmdPart);
      if (cmd) setParamHint(cmd.syntax);
      else setParamHint('');
    }
  }, [input, showSuggestions, session]);

  const addLine = useCallback((type: HistoryLine['type'], text: string) => {
    setHistoryLines(prev => {
      const next = [...prev, { id: lineIdCounter++, type, text, timestamp: Date.now() }];
      return next.slice(-100);
    });
  }, []);

  const executeCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return;

    addLine('input', cmd.trim());
    setCmdHistoryStack(prev => [...prev.slice(-100), cmd.trim()]);
    setCmdHistoryIdx(-1);

    // Check if this is an interactive command
    const cmdName = cmd.trim().split(/\s+/)[0].toUpperCase();
    const interactiveDef = INTERACTIVE_COMMANDS[cmdName];

    // If command has no arguments and is interactive, start a session
    if (interactiveDef && cmd.trim().split(/\s+/).length === 1) {
      const newSession: CommandSession = {
        commandName: cmdName,
        step: 0,
        prompts: interactiveDef.prompts,
        collectedArgs: [],
      };
      setSession(newSession);
      addLine('prompt', interactiveDef.prompts[0]);
      setInput('');
      setSuggestions([]);
      setParamHint('');
      return;
    }

    // Normal execution
    const result = commandEngine.execute(cmd);
    if (result.message) {
      const lines = result.message.split('\n');
      for (const line of lines) {
        addLine(result.success ? 'success' : 'error', line);
      }
    }

    setInput('');
    setSuggestions([]);
    setParamHint('');
    setShowSuggestions(true);
  }, [addLine]);

  const handleSessionInput = useCallback((value: string) => {
    if (!session) return;

    const trimmed = value.trim();

    // Enter with empty input = end session (for repeating commands like LINE)
    if (!trimmed) {
      if (session.collectedArgs.length >= 2) {
        // Try to build and execute the command
        const interactiveDef = INTERACTIVE_COMMANDS[session.commandName];
        if (interactiveDef) {
          const finalCmd = interactiveDef.buildCommand(session.collectedArgs);
          if (finalCmd) {
            addLine('input', `(${session.commandName} 完成)`);
            const result = commandEngine.execute(finalCmd);
            if (result.message) {
              const lines = result.message.split('\n');
              for (const line of lines) {
                addLine(result.success ? 'success' : 'error', line);
              }
            }
          }
        }
      }
      addLine('output', `${session.commandName} 指令結束`);
      setSession(null);
      setInput('');
      return;
    }

    // Escape cancels session
    addLine('input', trimmed);

    // Collect the argument
    const newArgs = [...session.collectedArgs, trimmed];

    // Parse coordinate for display
    const coord = parseCoordinate(trimmed, session.lastPoint);
    if (coord) {
      addLine('output', `  → (${coord.x}, ${coord.y}, ${coord.z})`);
    }

    const nextStep = session.step + 1;
    const interactiveDef = INTERACTIVE_COMMANDS[session.commandName];

    // Check if we have enough args to execute
    if (nextStep >= session.prompts.length || (nextStep >= 2 && !interactiveDef)) {
      // Execute the built command
      if (interactiveDef) {
        const finalCmd = interactiveDef.buildCommand(newArgs);
        if (finalCmd) {
          const result = commandEngine.execute(finalCmd);
          if (result.message) {
            const lines = result.message.split('\n');
            for (const line of lines) {
              addLine(result.success ? 'success' : 'error', line);
            }
          }
        } else {
          addLine('error', '無法解析座標');
        }
      }
      setSession(null);
    } else {
      // Move to next prompt
      const nextPrompt = session.prompts[nextStep];
      addLine('prompt', nextPrompt);
      setSession({
        ...session,
        step: nextStep,
        collectedArgs: newArgs,
        lastPoint: coord || session.lastPoint,
      });
    }

    setInput('');
  }, [session, addLine]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+R: toggle history search
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      setSearchMode(true);
      setSearchQuery('');
      setTimeout(() => searchInputRef.current?.focus(), 50);
      return;
    }

    switch (e.key) {
      case 'Enter': {
        e.preventDefault();

        // If in interactive session, handle session input
        if (session) {
          handleSessionInput(input);
          return;
        }

        const trimmed = input.trim();
        if (!trimmed) return;

        if (trimmed.includes(' ')) {
          executeCommand(input);
          return;
        }

        const exactCmd = commandEngine.getCommandByName(trimmed.toUpperCase());
        if (exactCmd) {
          executeCommand(trimmed);
          return;
        }

        if (suggestions.length > 0 && selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
          const cmd = suggestions[selectedSuggestion];
          setInput(cmd.name + ' ');
          setSuggestions([]);
          setSelectedSuggestion(-1);
          return;
        }

        executeCommand(input);
        break;
      }

      case 'Tab':
        e.preventDefault();
        if (suggestions.length > 0) {
          const idx = selectedSuggestion >= 0 ? selectedSuggestion : 0;
          const cmd = suggestions[idx];
          if (cmd) {
            setInput(cmd.name + ' ');
            setSuggestions([]);
            setSelectedSuggestion(-1);
          }
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedSuggestion(prev => Math.max(0, prev - 1));
        } else if (cmdHistoryStack.length > 0) {
          const newIdx = cmdHistoryIdx < 0 ? cmdHistoryStack.length - 1 : Math.max(0, cmdHistoryIdx - 1);
          setCmdHistoryIdx(newIdx);
          setInput(cmdHistoryStack[newIdx] || '');
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedSuggestion(prev => Math.min(suggestions.length - 1, prev + 1));
        } else if (cmdHistoryIdx >= 0) {
          const newIdx = cmdHistoryIdx + 1;
          if (newIdx >= cmdHistoryStack.length) {
            setCmdHistoryIdx(-1);
            setInput('');
          } else {
            setCmdHistoryIdx(newIdx);
            setInput(cmdHistoryStack[newIdx] || '');
          }
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (session) {
          addLine('output', `${session.commandName} 指令已取消`);
          setSession(null);
          setInput('');
          return;
        }
        if (suggestions.length > 0) {
          setSuggestions([]);
          setSelectedSuggestion(-1);
          setShowSuggestions(false);
        } else if (input.trim()) {
          setInput('');
          setShowSuggestions(true);
        } else {
          inputRef.current?.blur();
          setShowSuggestions(true);
        }
        break;
    }
  }, [input, suggestions, selectedSuggestion, executeCommand, cmdHistoryStack, cmdHistoryIdx, showSuggestions, session, handleSessionInput, addLine]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (searchResults.length > 0 && searchResults[searchSelectedIdx]) {
          setInput(searchResults[searchSelectedIdx]);
          setSearchMode(false);
          inputRef.current?.focus();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSearchSelectedIdx(prev => Math.max(0, prev - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSearchSelectedIdx(prev => Math.min(searchResults.length - 1, prev + 1));
        break;
      case 'Escape':
        e.preventDefault();
        setSearchMode(false);
        inputRef.current?.focus();
        break;
    }
  }, [searchResults, searchSelectedIdx]);

  // Re-enable suggestions when input changes
  useEffect(() => {
    setShowSuggestions(true);
  }, [input]);

  const catColors: Record<string, string> = {
    voxel: '#58a6ff', view: '#3fb950', analysis: '#f85149',
    layer: '#d29922', export: '#a78bfa', system: '#8b949e',
    structure: '#f5a623', edit: '#638cff', file: '#94a3b8',
    material: '#e879f9',
  };

  const lineIcon = (type: string) => {
    if (type === 'input') return '\u203a';
    if (type === 'error') return '\u2717';
    if (type === 'success') return '\u2713';
    if (type === 'prompt') return '\u25b6';
    return '\u00b7';
  };

  const lineColor = (type: string) => {
    if (type === 'input') return '#e6edf3';
    if (type === 'error') return '#f85149';
    if (type === 'success') return '#3fb950';
    if (type === 'prompt') return '#d29922';
    if (type === 'output') return '#58a6ff';
    return '#8b949e';
  };

  return (
    <div className="command-line-container" style={{ height: isExpanded ? 120 : 28 }}>
      {/* Header toggle */}
      <div className="command-line-header" onClick={() => setIsExpanded(!isExpanded)}>
        <Terminal size={12} />
        <span>指令列</span>
        {session && (
          <span style={{ fontSize: 9, color: '#d29922', marginLeft: 8, fontWeight: 600 }}>
            [{session.commandName}]
          </span>
        )}
        {isExpanded ? <ChevronDown size={12} style={{ marginLeft: 'auto' }} /> : <ChevronUp size={12} style={{ marginLeft: 'auto' }} />}
        <span style={{ fontSize: 9, color: 'var(--text-secondary)', marginLeft: 8 }}>
          ` 或 : 聚焦 | Ctrl+R 搜尋
        </span>
      </div>

      {isExpanded && (
        <>
          {/* History area */}
          <div className="command-line-history" ref={historyRef} style={{ flex: 1, minHeight: 0 }}>
            {historyLines.map(line => (
              <div key={line.id} className={`cmd-line cmd-${line.type}`} style={{ color: lineColor(line.type) }}>
                <span className="cmd-line-icon">{lineIcon(line.type)}</span>
                <span className="cmd-line-text">{line.text}</span>
              </div>
            ))}
          </div>

          {/* History search overlay */}
          {searchMode && (
            <div className="cmd-search-overlay">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
                <Search size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="cmd-search-input"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="搜尋歷史指令..."
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                {searchResults.length === 0 && (
                  <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>
                    沒有匹配的歷史指令
                  </div>
                )}
                {searchResults.map((cmd: string, i: number) => (
                  <div
                    key={i}
                    className={`cmd-search-item ${i === searchSelectedIdx ? 'selected' : ''}`}
                    onClick={() => {
                      setInput(cmd);
                      setSearchMode(false);
                      inputRef.current?.focus();
                    }}
                  >
                    <ChevronRight size={10} style={{ flexShrink: 0, opacity: 0.4 }} />
                    <span>{cmd}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions dropdown (above input) */}
          {suggestions.length > 0 && !searchMode && !session && (
            <div className="command-line-suggestions">
              {suggestions.map((cmd: CommandDef, i: number) => (
                <div
                  key={cmd.name}
                  className={`cmd-suggestion ${i === selectedSuggestion ? 'selected' : ''}`}
                  onClick={() => {
                    setInput(cmd.name + ' ');
                    setSuggestions([]);
                    inputRef.current?.focus();
                  }}
                  onMouseEnter={() => setSelectedSuggestion(i)}
                >
                  <span className="cmd-sug-cat" style={{ color: catColors[cmd.category] || '#8b949e' }}>
                    [{cmd.category}]
                  </span>
                  <span className="cmd-sug-name">{cmd.name}</span>
                  <span className="cmd-sug-desc">{cmd.description}</span>
                </div>
              ))}
            </div>
          )}

          {/* Input area with AutoCAD-style prompt */}
          <div className="command-line-input-area">
            <span style={{
              fontSize: 11, color: session ? '#d29922' : '#8b949e',
              whiteSpace: 'nowrap', marginRight: 4, fontWeight: session ? 600 : 400,
              flexShrink: 0,
            }}>
              {promptText}
            </span>
            <input
              ref={inputRef}
              type="text"
              className="command-line-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              placeholder={session ? '輸入座標或數值...' : '輸入指令... (HELP 查看所有指令)'}
              spellCheck={false}
              autoComplete="off"
            />
            {paramHint && !session && (
              <span className="cmd-param-hint">{paramHint}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
