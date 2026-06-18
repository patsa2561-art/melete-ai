// exact Shapley from a coalition value table V[mask] (bit i set = feature i present)
function shapley(V, n){
  const fact=[1]; for(let i=1;i<=n;i++)fact[i]=fact[i-1]*i;
  const w=(s)=>fact[s]*fact[n-s-1]/fact[n];
  const phi=new Array(n).fill(0);
  for(let i=0;i<n;i++){
    for(let mask=0;mask<(1<<n);mask++){
      if(mask&(1<<i))continue;            // S without i
      let s=0; for(let b=0;b<n;b++) if(mask&(1<<b))s++;
      phi[i]+= w(s)*(V[mask|(1<<i)]-V[mask]);
    }
  }
  return phi;
}
const n=8;
// additive + pairwise-interaction value function
function fn(mask){ let v=0; const a=[0.5,1.0,-0.3,2.0,0,0.7,1.5,-1.0]; for(let i=0;i<n;i++) if(mask&(1<<i)) v+=a[i]; if((mask&1)&&(mask&2)) v+=0.4; return v; }
const V=[]; for(let m=0;m<(1<<n);m++)V[m]=fn(m);
const phi=shapley(V,n);
const sum=phi.reduce((a,b)=>a+b,0); const eff=V[(1<<n)-1]-V[0];
console.log("Σφ",sum.toFixed(10),"v(N)-v(∅)",eff.toFixed(10),"residual",Math.abs(sum-eff).toExponential(2));
console.log("dummy feature 4 (a=0,no interaction) φ4 =",phi[4].toExponential(2),"(should be 0)");
// symmetry: build a table where features 5,6 are identical contributors
function fn2(mask){ let v=0; for(let i=0;i<n;i++) if(mask&(1<<i)) v+= (i===5||i===6)?1.3:0.2; return v; }
const V2=[]; for(let m=0;m<(1<<n);m++)V2[m]=fn2(m); const p2=shapley(V2,n);
console.log("symmetry φ5",p2[5].toFixed(8),"φ6",p2[6].toFixed(8),"diff",Math.abs(p2[5]-p2[6]).toExponential(2));
// linearity: φ(V+V2)=φ(V)+φ(V2)
const V3=V.map((x,i)=>x+V2[i]); const p3=shapley(V3,n);
let maxd=0; for(let i=0;i<n;i++) maxd=Math.max(maxd,Math.abs(p3[i]-(phi[i]+p2[i])));
console.log("linearity max dev",maxd.toExponential(2));
