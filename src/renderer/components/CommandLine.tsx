/**
 * CommandLine - AutoCAD-style Command Line Interface
 * 
 * Features:
 * - Input with ">" prompt
 * - History display (last 20 entries)
 * - Autocomplete dropdown (fuzzy search via Fuse.js)
 * - Tab completion
 * - Arrow key history navigation
 * - Parameter hints
 * - Error messages in red
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { commandEngine, CommandResult, CommandDef } from '../engines/CommandEngine';
import { ChevronRight, Terminal } from 'lucide-react';

interface HistoryLine {
  type: 'input' | 'output' | 'error';
  text: string;
  timestamp: number;
}

export function CommandLine() {
  const [input, setInput] = useState('');
  const [historyLines, setHistoryLines] = useState<HistoryLine[]>([
    { type: 'output', text: 'FastDesign v1.3 — 輸入 HELP 查看所有指令', timestamp: Date.now() },
  ]);
  const [suggestions, setSuggestions] = useState<CommandDef[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [paramHint, setParamHint] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

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

  // Update suggestions and param hint as user types
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
      // Show command suggestions
      const results = commandEngine.search(cmdPart);
      setSuggestions(results);
      setSelectedSuggestion(-1);

      // Check if exact match for param hint
      const exact = commandEngine.getCommandByName(cmdPart);
      if (exact) {
        setParamHint(exact.syntax);
      } else {
        setParamHint('');
      }
    } else {
      // Already typing args, show param hint
      setSuggestions([]);
      const cmd = commandEngine.getCommandByName(cmdPart);
      if (cmd) {
        setParamHint(cmd.syntax);
      }
    }
  }, [input]);

  const executeCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return;

    const newLines: HistoryLine[] = [
      ...historyLines,
      { type: 'input', text: cmd, timestamp: Date.now() },
    ];

    const result = commandEngine.execute(cmd);

    if (result.message) {
      const lines = result.message.split('\n');
      for (const line of lines) {
        newLines.push({
          type: result.success ? 'output' : 'error',
          text: line,
          timestamp: Date.now(),
        });
      }
    }

    // Keep last 50 lines
    setHistoryLines(newLines.slice(-50));
    setInput('');
    setSuggestions([]);
    setParamHint('');
  }, [historyLines]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
          const cmd = suggestions[selectedSuggestion];
          setInput(cmd.name + ' ');
          setSuggestions([]);
          setSelectedSuggestion(-1);
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
        } else {
          const prev = commandEngine.getHistoryPrev();
          if (prev !== null) setInput(prev);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedSuggestion(prev => Math.min(suggestions.length - 1, prev + 1));
        } else {
          const next = commandEngine.getHistoryNext();
          if (next !== null) setInput(next);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setSuggestions([]);
        setSelectedSuggestion(-1);
        inputRef.current?.blur();
        break;
    }
  }, [input, suggestions, selectedSuggestion, executeCommand]);

  const catColors: Record<string, string> = {
    voxel: '#58a6ff',
    view: '#3fb950',
    analysis: '#f85149',
    layer: '#d29922',
    export: '#a78bfa',
    system: '#8b949e',
  };

  return (
    <div className="command-line-container">
      {/* Toggle button */}
      <div className="command-line-header" onClick={() => setIsExpanded(!isExpanded)}>
        <Terminal size={12} />
        <span>指令列</span>
        <span style={{ fontSize: 9, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          ` 或 : 聚焦
        </span>
      </div>

      {isExpanded && (
        <>
          {/* History area */}
          <div className="command-line-history" ref={historyRef}>
            {historyLines.map((line, i) => (
              <div key={i} className={`cmd-line cmd-${line.type}`}>
                {line.type === 'input' && <span className="cmd-prompt">&gt; </span>}
                <span>{line.text}</span>
              </div>
            ))}
          </div>

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
              placeholder="輸入指令... (HELP 查看所有指令)"
              spellCheck={false}
              autoComplete="off"
            />
            {paramHint && (
              <span className="cmd-param-hint">{paramHint}</span>
            )}
          </div>

          {/* Autocomplete dropdown */}
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
                  <span className="cmd-suggestion-name" style={{ color: catColors[cmd.category] || '#e6edf3' }}>
                    {cmd.name}
                  </span>
                  <span className="cmd-suggestion-syntax">{cmd.syntax}</span>
                  <span className="cmd-suggestion-desc">{cmd.description}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
