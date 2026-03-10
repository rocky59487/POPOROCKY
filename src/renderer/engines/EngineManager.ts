import eventBus from './EventBus';
import { Vec3, Layer, PBRMaterial, LODLevel, CollabUser } from '../store/useStore';

export class LayerEngine {
  private layers: Layer[] = [];
  setLayers(l: Layer[]) { this.layers = l; }
  addLayer(l: Layer) { this.layers.push(l); eventBus.emit('layer:added', l); }
  removeLayer(id: string) { this.layers = this.layers.filter(l=>l.id!==id); eventBus.emit('layer:removed', id); }
  duplicateLayer(id: string): Layer|null { const s=this.layers.find(l=>l.id===id); if(!s)return null; const d={...s,id:`layer_${Date.now()}`,name:`${s.name} (複製)`,order:this.layers.length,voxelCount:0}; this.layers.push(d); return d; }
  reorder(from: number, to: number) { const [item]=this.layers.splice(from,1); this.layers.splice(to,0,item); this.layers.forEach((l,i)=>l.order=i); }
}

export class MultiplayerEngine {
  private users: CollabUser[] = [];
  private connected = false;
  connect(_roomId: string) {
    this.connected=true;
    this.users=[{id:'local',name:'我',color:'#638cff',online:true},{id:'demo1',name:'User A',color:'#3dd68c',cursor:{x:5,y:0,z:3},online:true},{id:'demo2',name:'User B',color:'#f5a623',cursor:{x:-3,y:2,z:1},online:true}];
    eventBus.emit('multiplayer:connected',{userCount:this.users.length});
  }
  disconnect() { this.connected=false; this.users=[]; eventBus.emit('multiplayer:disconnected'); }
  getUsers() { return this.users; }
  isConnected() { return this.connected; }
}

export class TextureEngine {
  generateProcedural(type: string, size=256): {data:Uint8Array;width:number;height:number} {
    const d=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const i=(y*size+x)*4;
      if(type==='checker'){const c=((x>>4)^(y>>4))&1?200:50;d[i]=c;d[i+1]=c;d[i+2]=c;d[i+3]=255;}
      else if(type==='noise'){const v=Math.floor(Math.random()*256);d[i]=v;d[i+1]=v;d[i+2]=v;d[i+3]=255;}
      else{d[i]=Math.floor(x/size*255);d[i+1]=Math.floor(y/size*255);d[i+2]=128;d[i+3]=255;}
    }
    eventBus.emit('texture:generated',{type,size});
    return {data:d,width:size,height:size};
  }
  bakeTexture(id: string) { eventBus.emit('texture:baked',{id}); }
}

export class LODEngine {
  private levels: LODLevel[] = [];
  setLevels(l: LODLevel[]) { this.levels=l; }
  autoGenerate(tris: number): LODLevel[] {
    return [{level:0,distance:0,triangleCount:tris,enabled:true},{level:1,distance:50,triangleCount:Math.floor(tris*0.5),enabled:true},{level:2,distance:100,triangleCount:Math.floor(tris*0.25),enabled:true},{level:3,distance:200,triangleCount:Math.floor(tris*0.1),enabled:false}];
  }
  selectLOD(dist: number): number {
    for(let i=this.levels.length-1;i>=0;i--) if(this.levels[i].enabled&&dist>=this.levels[i].distance) return i;
    return 0;
  }
  getPerformanceGain(level: number): number { return level>0?(1-1/Math.pow(2,level))*100:0; }
}

export const layerEngine = new LayerEngine();
export const multiplayerEngine = new MultiplayerEngine();
export const textureEngine = new TextureEngine();
export const lodEngine = new LODEngine();
