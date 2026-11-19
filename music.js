/* Musica di sottofondo generata in tempo reale (Web Audio API): nessun file audio, nessun diritto d'autore.
   Uso: Music.start('ambient'|'lounge'|'cyber'), Music.stop(), Music.playing, Music.style */
(function(){
  const N=n=>440*Math.pow(2,(n-69)/12); // numero di nota MIDI -> frequenza
  let ctx=null, master=null, wet=null, timer=null, nextT=0, step=0, cur=null, gen=0;

  function setup(){
    if(ctx)return;
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC)throw new Error('noaudio');
    ctx=new AC();
    const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-20; comp.ratio.value=3;
    master=ctx.createGain(); master.gain.value=0;
    // riverbero: risposta all'impulso generata (rumore che si spegne)
    const len=ctx.sampleRate*3.2, ir=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6)}
    const conv=ctx.createConvolver(); conv.buffer=ir;
    wet=ctx.createGain(); wet.gain.value=.38;
    wet.connect(conv); conv.connect(master);
    master.connect(comp); comp.connect(ctx.destination);
  }
  const out=(node,dry=1,rev=1)=>{const g=ctx.createGain();g.gain.value=dry;node.connect(g);g.connect(master);if(rev){const r=ctx.createGain();r.gain.value=rev;node.connect(r);r.connect(wet)}};

  // --- strumenti ---
  function pad(notes,t,dur,vol=.05,cut=1400){
    const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(cut*.6,t); f.frequency.linearRampToValueAtTime(cut,t+dur*.5); f.frequency.linearRampToValueAtTime(cut*.6,t+dur);
    const g=ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+dur*.35); g.gain.setValueAtTime(vol,t+dur*.65); g.gain.linearRampToValueAtTime(0,t+dur+1.5);
    f.connect(g); out(g,.8,.9);
    notes.forEach(n=>[-6,6].forEach(det=>{const o=ctx.createOscillator();o.type='triangle';o.frequency.value=N(n);o.detune.value=det;o.connect(f);o.start(t);o.stop(t+dur+1.6)}));
  }
  function bell(n,t,vol=.06){
    const o=ctx.createOscillator(), m=ctx.createOscillator(), mg=ctx.createGain(), g=ctx.createGain();
    o.type='sine'; o.frequency.value=N(n); m.frequency.value=N(n)*3.5; mg.gain.setValueAtTime(N(n)*1.2,t); mg.gain.exponentialRampToValueAtTime(1,t+1.5);
    m.connect(mg); mg.connect(o.frequency);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.01); g.gain.exponentialRampToValueAtTime(.0001,t+3);
    o.connect(g); out(g,.6,1); o.start(t); m.start(t); o.stop(t+3.1); m.stop(t+3.1);
  }
  function epiano(n,t,dur,vol=.05){ // pianoforte elettrico (FM morbido)
    const o=ctx.createOscillator(), m=ctx.createOscillator(), mg=ctx.createGain(), g=ctx.createGain();
    o.type='sine'; o.frequency.value=N(n); m.frequency.value=N(n); mg.gain.setValueAtTime(N(n)*.9,t); mg.gain.exponentialRampToValueAtTime(N(n)*.05,t+.6);
    m.connect(mg); mg.connect(o.frequency);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.008); g.gain.exponentialRampToValueAtTime(vol*.35,t+.5); g.gain.exponentialRampToValueAtTime(.0001,t+dur+.6);
    o.connect(g); out(g,.9,.5); o.start(t); m.start(t); o.stop(t+dur+.7); m.stop(t+dur+.7);
  }
  function bass(n,t,dur,vol=.12,type='sine'){
    const o=ctx.createOscillator(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    o.type=type; o.frequency.value=N(n); f.type='lowpass'; f.frequency.value=type==='sine'?800:420;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.02); g.gain.exponentialRampToValueAtTime(vol*.5,t+dur*.6); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(f); f.connect(g); out(g,1,0); o.start(t); o.stop(t+dur+.05);
  }
  let noiseBuf=null;
  function tick(t,vol=.025,hp=7000,len=.05){
    if(!noiseBuf){noiseBuf=ctx.createBuffer(1,ctx.sampleRate*.3,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
    const s=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    s.buffer=noiseBuf; f.type='highpass'; f.frequency.value=hp;
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+len);
    s.connect(f); f.connect(g); out(g,1,.2); s.start(t); s.stop(t+len+.02);
  }
  function kick(t,vol=.18){
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(42,t+.18);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+.3);
    o.connect(g); out(g,1,0); o.start(t); o.stop(t+.32);
  }
  function pluck(n,t,vol=.035,cut=2200){ // arpeggio "cyber"
    const o=ctx.createOscillator(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    o.type='sawtooth'; o.frequency.value=N(n); f.type='lowpass'; f.Q.value=6;
    f.frequency.setValueAtTime(cut,t); f.frequency.exponentialRampToValueAtTime(300,t+.22);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+.3);
    o.connect(f); f.connect(g); out(g,.8,.6); o.start(t); o.stop(t+.32);
  }
  const pick=a=>a[Math.floor(Math.random()*a.length)];

  // --- stili ---
  const STYLES={
    // Ambient: accordi lunghi e morbidi + campanelle sparse (stile spa)
    ambient:{beat:2, run(t,s){
      const prog=[[48,55,64,71],[45,52,60,67,71],[41,48,57,64],[43,50,59,64]]; // Cmaj7 Am9 Fmaj7 G6
      const c=prog[Math.floor(s/4)%4];
      if(s%4===0){pad(c,t,8.4,.045,1300);bass(c[0]-12,t,7.5,.07)}
      if(Math.random()<.55)bell(pick([72,74,76,79,81,84]),t+Math.random()*.8,.035);
    }},
    // Lounge: pianoforte elettrico jazz, basso e spazzole leggere
    lounge:{beat:60/84/2, run(t,s){
      const prog=[[50,57,60,64,65],[43,53,57,59,64],[48,55,59,62,64],[45,55,58,61,64]]; // Dm9 G13 Cmaj9 A7(b9)
      const bar=Math.floor(s/16)%4, c=prog[bar], i=s%16;
      if(i===0||i===7||i===10)c.slice(1).forEach((n,k)=>epiano(n+12,t+k*.012,.9,.016));
      if(i%4===0)bass(c[0]-12+[0,7,12,7][i/4],t,.5,.11);
      if(i%2===0)tick(t,i%4===2?.03:.012,6500,.06);
      if(i===14&&Math.random()<.5)epiano(pick([76,79,81,84]),t,.4,.02);
    }},
    // Cyber: arpeggio elettronico futuristico, basso profondo, battito leggero
    cyber:{beat:60/100/4, run(t,s){
      const prog=[[57,60,64,69],[53,57,60,65],[48,52,55,60],[55,59,62,67]]; // Am F C G
      const bar=Math.floor(s/16)%4, c=prog[bar], i=s%16;
      pluck(c[[0,1,2,3,2,1,3,2][i%8]]+12,t,.026,1600+Math.sin(s/9)*900);
      if(i%4===0)bass(c[0]-24,t,.42,.13,'sawtooth');
      if(i%8===0)kick(t,.12);
      if(i%2===1)tick(t,.01,9000,.03);
      if(i===0)pad(c,t,60/100*4,.018,900);
    }}
  };

  function loop(my){
    if(my!==gen||!cur)return;
    const st=STYLES[cur];
    while(nextT<ctx.currentTime+.4){st.run(nextT,step);step++;nextT+=st.beat}
  }
  const Music={
    style:null, get playing(){return !!cur},
    async start(style){
      setup(); if(ctx.state==='suspended')await ctx.resume();
      if(cur===style)return; this.stop(true);
      cur=style; this.style=style; step=0; nextT=ctx.currentTime+.1; const my=++gen;
      master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value,ctx.currentTime); master.gain.linearRampToValueAtTime(.55,ctx.currentTime+2);
      timer=setInterval(()=>loop(my),100); loop(my);
    },
    stop(quick){
      if(!ctx)return; clearInterval(timer); timer=null; gen++; cur=null;
      const t=ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value,t); master.gain.linearRampToValueAtTime(0,t+(quick?.15:1.2));
    },
    // da chiamare subito dentro un tocco/click: iPhone e alcuni browser accendono l'audio solo così
    prime(){try{setup();if(ctx.state==='suspended')ctx.resume()}catch(e){}},
    pause(){if(ctx&&ctx.state==='running')ctx.suspend()},
    resume(){if(ctx&&cur&&ctx.state==='suspended')ctx.resume()}
  };
  window.Music=Music;
})();
