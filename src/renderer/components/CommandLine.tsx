/**
 * CommandLine - AutoCAD-style Command Line Interface
 * Uses Fuse.js for fuzzy search, bottom-fixed panel with history + suggestions
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Fuse from 'fuse.js';
import { commandEngine, CommandResult, CommandDef } from '../engines/CommandEngine';
import { ChevronRight, Terminal, ChevronUp, ChevronDown } from 'lucide-react';

/* ─── Fuse.js fuzzy search setup ─── */
const allCommands = commandEngine.getAllCommands();
const fuse = new Fuse(allCommands, {
  keys: ['name', 'syntax', 'description', 'category'],
  threshold: 0.4,
  includeScore: true,
});

interface HistoryLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'success';
  text: string;
  timestamp: number;
}

let lineIdCounter = 0;

export function CommandLine() {
  const [input, setInput] = useState('');
  const [historyLines, setHistoryLines] = useState<HistoryLine[]>([
    { id: lineIdCounter++, type: 'output', text: 'FastDesign v1.4 — 輸入 HELP 查看所有指令，`:` 或 `` ` `` 聚焦指令列', timestamp: Date.now() },
  ]);
  const [suggestions, setSuggestions] = useState<CommandDef[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [paramHint, setParamHint] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [cmdHistoryStack, setCmdHistoryStack] = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

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

  // Update suggestions using Fuse.js as user types
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      setSuggestions([]);
      setParamHint('');
      setSelectedSuggestion(-1);
      return;
    }

    const parts = trimmed.split(/\s+/);
    const cmdPart = parts[0];

    if (parts.length === 1) {
      // Fuzzy search via Fuse.js
      const results = fuse.search(cmdPart).slice(0, 8).map(r => r.item);
      setSuggestions(results);
      setSelectedSuggestion(results.length > 0 ? 0 : -1);

      // Check for exact match param hint
      const exact = commandEngine.getCommandByName(cmdPart);
      if (exact) setParamHint(exact.syntax);
      else setParamHint('');
    } else {
      setSuggestions([]);
      const cmd = commandEngine.getCommandByName(cmdPart);
      if (cmd) setParamHint(cmd.syntax);
    }
  }, [input]);

  const addLine = useCallback((type: HistoryLine['type'], text: string) => {
    setHistoryLines(prev => {
      const next = [...prev, { id: lineIdCounter++, type, text, timestamp: Date.now() }];
      return next.slice(-50);
    });
  }, []);

  const executeCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return;

    addLine('input', cmd.trim());

    // Add to command history stack
    setCmdHistoryStack(prev => [...prev.slice(-100), cmd.trim()]);
    setCmdHistoryIdx(-1);

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
  }, [addLine]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        // If input has args (spaces), execute directly
        if (input.trim().includes(' ')) {
          executeCommand(input);
        } else if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
          // Check if input exactly matches the selected suggestion
          const cmd = suggestions[selectedSuggestion];
          if (cmd.name.toUpperCase() === input.trim().toUpperCase()) {
            // Exact match - execute immediately
            executeCommand(input);
          } else {
            // Partial match - fill in the suggestion
            setInput(cmd.name + ' ');
            setSuggestions([]);
            setSelectedSuggestion(-1);
          }
        } else {
          executeCommand(input);
        }
        break;

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
        setSuggestions([]);
        setSelectedSuggestion(-1);
        setInput('');
        inputRef.current?.blur();
        break;
    }
  }, [input, suggestions, selectedSuggestion, executeCommand, cmdHistoryStack, cmdHistoryIdx]);

  const catColors: Record<string, string> = {
    voxel: '#58a6ff', view: '#3fb950', analysis: '#f85149',
    layer: '#d29922', export: '#a78bfa', system: '#8b949e',
    structure: '#f5a623', edit: '#638cff', file: '#94a3b8',
    material: '#e879f9',
  };

  const lineIcon = (type: string) => {
    if (type === 'input') return '›';
    if (type === 'error') return '✗';
    if (type === 'success') return '✓';
    if (type === 'output') return '·';
    return '·';
  };

  const lineColor = (type: string) => {
    if (type === 'input') return '#e6edf3';
    if (type === 'error') return '#f85149';
    if (type === 'success') return '#3fb950';
    if (type === 'output') return '#58a6ff';
    return '#8b949e';
  };

  return (
    <div className="command-line-container">
      {/* Header toggle */}
      <div className="command-line-header" onClick={() => setIsExpanded(!isExpanded)}>
        <Terminal size={12} />
        <span>指令列</span>
        {isExpanded ? <ChevronDown size={12} style={{ marginLeft: 'auto' }} /> : <ChevronUp size={12} style={{ marginLeft: 'auto' }} />}
        <span style={{ fontSize: 9, color: 'var(--text-secondary)', marginLeft: 8 }}>
          ` 或 : 聚焦
        </span>
      </div>

      {isExpanded && (
        <>
          {/* History area */}
          <div className="command-line-history" ref={historyRef}>
            {historyLines.map(line => (
              <div key={line.id} className={`cmd-line cmd-${line.type}`} style={{ color: lineColor(line.type) }}>
                <span className="cmd-line-icon">{lineIcon(line.type)}</span>
                <span className="cmd-line-text">{line.text}</span>
              </div>
            ))}
          </div>

          {/* Suggestions dropdown (above input) */}
          {suggestions.length > 0 && (
            <div className="command-line-suggestions">
              {suggestions.map((cmd, i) => (
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

          {/* Input area */}
          <div className="command-line-input-area">
            <ChevronRight size={14} className="cmd-input-prompt" />
            <input
              ref={inputRef}
              type="text"
              className="command-line-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              placeholder="輸入指令... (HELP 查看所有指令)"
              spellCheck={false}
              autoComplete="off"
            />
            {paramHint && (
              <span className="cmd-param-hint">{paramHint}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
