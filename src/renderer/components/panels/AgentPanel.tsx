import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { agentEngine } from '../../engines/EngineManager';
import { Bot, Send, Sparkles, CheckCircle } from 'lucide-react';

export function AgentPanel() {
  const [input,setInput]=useState('');
  const messages=useStore(s=>s.agentMessages), addMsg=useStore(s=>s.addAgentMessage);
  const thinking=useStore(s=>s.agentThinking), setThinking=useStore(s=>s.setAgentThinking);
  const addLog=useStore(s=>s.addLog), voxels=useStore(s=>s.voxels);

  const handleSend=async()=>{if(!input.trim())return;addMsg({role:'user',content:input,ts:Date.now()});const q=input;setInput('');setThinking(true);const r=await agentEngine.suggest(q);addMsg({role:'agent',content:r,ts:Date.now()});setThinking(false);addLog('info','Agent',r);};
  const handleCheck=()=>{const r=agentEngine.checkRules(voxels);addMsg({role:'agent',content:r.passed?'所有設計規則檢查通過！':`發現 ${r.violations.length} 項違規`,ts:Date.now()});};

  return (
    <div className="glass-panel" style={{flex:1}}>
      <div className="panel-header"><span><Bot size={12}/> AI 代理人</span><div className="panel-header-actions"><button className="btn-sm" onClick={handleCheck}><CheckCircle size={11}/> 檢查</button></div></div>
      <div className="panel-body" style={{display:'flex',flexDirection:'column'}}>
        <div style={{flex:1,overflowY:'auto',marginBottom:8}}>
          {messages.length===0&&<div className="text-xs text-muted" style={{padding:8}}>輸入問題或點擊「檢查」進行設計規則驗證</div>}
          {messages.map((m,i)=>(<div key={i} className={`chat-msg ${m.role}`}><div className="chat-bubble">{m.role==='agent'&&<Sparkles size={10} style={{marginRight:4}}/>}{m.content}</div><div className="chat-time">{new Date(m.ts).toLocaleTimeString()}</div></div>))}
          {thinking&&<div className="chat-msg agent"><div className="chat-bubble thinking">思考中...</div></div>}
        </div>
        <div style={{display:'flex',gap:4}}>
          <input className="input" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSend()} placeholder="詢問 AI 代理人..." style={{flex:1}}/>
          <button className="btn-icon" onClick={handleSend} disabled={thinking}><Send size={13}/></button>
        </div>
      </div>
    </div>
  );
}
