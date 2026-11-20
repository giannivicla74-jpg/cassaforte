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

  // ---------- Suoni della natura e chitarra ----------
  // Rumori di base (2 s, ripetuti): bianco, rosa (pioggia/foglie), marrone (mare/vento)
  const noises={};
  function noise(kind){
    if(noises[kind])return noises[kind];
    const len=ctx.sampleRate*2, b=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let c=0;c<2;c++){
      const d=b.getChannelData(c); let b0=0,b1=0,b2=0,last=0;
      for(let i=0;i<len;i++){
        const w=Math.random()*2-1;
        if(kind==='pink'){b0=.99765*b0+w*.099;b1=.963*b1+w*.2965;b2=.57*b2+w*1.0526;d[i]=(b0+b1+b2+w*.1848)*.11}
        else if(kind==='brown'){last=(last+.02*w)/1.02;d[i]=last*3.5}
        else d[i]=w;
      }
    }
    return noises[kind]=b;
  }
  // Fondo continuo (fruscio): ogni stile lo crea all'avvio e lo spegne in dissolvenza all'uscita
  let beds=[];
  function bed(kind,{type='lowpass',freq=1000,q=.7,vol=.2,lfo=0,lfoDepth=0,lfoFreq=0,rev=.3}={}){
    const src=ctx.createBufferSource(); src.buffer=noise(kind); src.loop=true;
    const f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
    const g=ctx.createGain(); g.gain.value=0; g.gain.linearRampToValueAtTime(vol,ctx.currentTime+2.5);
    src.connect(f); f.connect(g); out(g,1,rev);
    const nodes=[src];
    if(lfo){ // onda lenta che muove volume e/o filtro (il mare che va e viene, il vento a raffiche)
      const o=ctx.createOscillator(); o.frequency.value=lfo;
      const og=ctx.createGain(); og.gain.value=lfoDepth; o.connect(og); og.connect(g.gain);
      if(lfoFreq){const of=ctx.createGain(); of.gain.value=lfoFreq; o.connect(of); of.connect(f.frequency)}
      o.start(); nodes.push(o);
    }
    src.start(); beds.push({g,nodes});
  }
  function bedsOff(fade){
    const t=ctx.currentTime;
    beds.forEach(({g,nodes})=>{g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(g.gain.value,t);g.gain.linearRampToValueAtTime(0,t+fade);nodes.forEach(n=>{try{n.stop(t+fade+.05)}catch(e){}})});
    beds=[];
  }
  // goccia di pioggia: un piccolo "tic" filtrato, a volte più vicino
  function drop(t,vol){
    const s=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    s.buffer=noise('white'); f.type='bandpass'; f.frequency.value=1800+Math.random()*3500; f.Q.value=4;
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+.04+Math.random()*.05);
    s.connect(f); f.connect(g); out(g,.7,.5); s.start(t,Math.random()*1.5); s.stop(t+.12);
  }
  // cinguettio: fischi rapidi che salgono e scendono, ripetuti 2-6 volte (uccelli diversi a caso)
  function chirp(t,vol=.05){
    const kind=Math.floor(Math.random()*3), base=2200+Math.random()*2200, n=2+Math.floor(Math.random()*5), gap=.07+Math.random()*.08;
    const pan=ctx.createStereoPanner?ctx.createStereoPanner():null; if(pan)pan.pan.value=Math.random()*1.6-.8;
    for(let k=0;k<n;k++){
      const tt=t+k*gap, d=.05+Math.random()*.04, o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sine';
      if(kind===0){o.frequency.setValueAtTime(base,tt);o.frequency.exponentialRampToValueAtTime(base*1.6,tt+d)}
      else if(kind===1){o.frequency.setValueAtTime(base*1.5,tt);o.frequency.exponentialRampToValueAtTime(base*.8,tt+d)}
      else{o.frequency.setValueAtTime(base,tt);o.frequency.linearRampToValueAtTime(base*1.25,tt+d/2);o.frequency.linearRampToValueAtTime(base*.9,tt+d)}
      g.gain.setValueAtTime(0,tt); g.gain.linearRampToValueAtTime(vol,tt+.008); g.gain.exponentialRampToValueAtTime(.0001,tt+d);
      o.connect(g); if(pan){g.connect(pan)} else out(g,.8,.6); o.start(tt); o.stop(tt+d+.02);
    }
    if(pan)out(pan,.8,.6);
  }
  // chitarra acustica: corda pizzicata calcolata con l'algoritmo di Karplus-Strong
  const strings={};
  function guitarBuf(n){
    if(strings[n])return strings[n];
    const sr=ctx.sampleRate, len=Math.floor(sr*2.6), b=ctx.createBuffer(1,len,sr), d=b.getChannelData(0);
    const P=Math.max(2,Math.round(sr/N(n))), decay=n<52?.9965:.994;
    let prev=0; for(let i=0;i<P;i++){const w=Math.random()*2-1;d[i]=(w+prev)*.5;prev=w} // eccitazione morbida (plettro/dito)
    for(let i=P;i<len;i++)d[i]=decay*.5*(d[i-P]+d[i-P-1]);
    return strings[n]=b;
  }
  function gnote(n,t,vol=.32){
    const s=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    s.buffer=guitarBuf(n); f.type='lowpass'; f.frequency.value=3200; g.gain.value=vol;
    s.connect(f); f.connect(g); out(g,.9,.45); s.start(t); s.stop(t+2.6);
  }
  Object.assign(STYLES,{
    // Pioggia: fruscio continuo + gocce vicine e lontane
    rain:{beat:.05, begin(){
      bed('pink',{type:'bandpass',freq:1400,q:.5,vol:.55,rev:.25});
      bed('pink',{type:'highpass',freq:4500,vol:.16,lfo:.07,lfoDepth:.05,rev:.1});
      bed('brown',{type:'lowpass',freq:300,vol:.25,rev:0});
    }, run(t){
      if(Math.random()<.35)drop(t+Math.random()*.05,.025+Math.random()*.05);
    }},
    // Onde del mare: rumore profondo che sale e scende ogni ~9 secondi, con la schiuma che frigge
    sea:{beat:.5, begin(){
      bed('brown',{type:'lowpass',freq:650,q:.4,vol:.5,lfo:.11,lfoDepth:.38,lfoFreq:420,rev:.4});
      bed('pink',{type:'highpass',freq:2800,vol:.07,lfo:.11,lfoDepth:.065,rev:.5});
    }, run(t){
      if(Math.random()<.04)chirp(t,.012); // qualche gabbiano lontano
    }},
    // Uccellini: cinguettii sparsi da più direzioni, con un filo di vento
    birds:{beat:.3, begin(){
      bed('brown',{type:'lowpass',freq:500,vol:.14,lfo:.05,lfoDepth:.08,rev:.2});
    }, run(t){
      if(Math.random()<.32)chirp(t+Math.random()*.2,.035+Math.random()*.03);
    }},
    // Foresta: vento tra gli alberi a raffiche, fruscio di foglie, uccelli lontani e un cuculo ogni tanto
    forest:{beat:.4, begin(){
      bed('brown',{type:'lowpass',freq:420,vol:.4,lfo:.06,lfoDepth:.28,lfoFreq:220,rev:.3});
      bed('pink',{type:'bandpass',freq:2600,q:.8,vol:.06,lfo:.09,lfoDepth:.05,rev:.4});
    }, run(t,s){
      if(Math.random()<.12)chirp(t,.018+Math.random()*.015);
      if(s%60===30){[0,.38].forEach((d,k)=>{bell(k?72:76,t+d,.03)})} // "cu-cù"
    }},
    // Chitarra: arpeggio pizzicato con le dita, giro di accordi caldo (Am - F - C - G)
    guitar:{beat:60/72/2, run(t,s){
      const prog=[[45,52,57,60,64],[41,48,53,57,60],[48,52,55,60,64],[43,47,50,55,59]];
      const c=prog[Math.floor(s/16)%4], i=s%16, pat=[0,2,3,4,2,3,4,3];
      const n=i%8===0?c[0]:c[pat[i%8]];
      gnote(n,t+(Math.random()*.012),i%8===0?.36:.24);
      if(i===12&&Math.random()<.5)gnote(c[4]+12,t+.02,.12); // piccola nota acuta di abbellimento
    }}
  });

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
      if(!STYLES[style])style='ambient';
      cur=style; this.style=style; step=0; nextT=ctx.currentTime+.1; const my=++gen;
      master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value,ctx.currentTime); master.gain.linearRampToValueAtTime(.55,ctx.currentTime+2);
      STYLES[style].begin?.();
      timer=setInterval(()=>loop(my),100); loop(my);
    },
    stop(quick){
      if(!ctx)return; clearInterval(timer); timer=null; gen++; cur=null; bedsOff(quick?.15:1.2);
      const t=ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value,t); master.gain.linearRampToValueAtTime(0,t+(quick?.15:1.2));
    },
    // da chiamare subito dentro un tocco/click: iPhone e alcuni browser accendono l'audio solo così
    prime(){try{setup();if(ctx.state==='suspended')ctx.resume()}catch(e){}},
    pause(){if(ctx&&ctx.state==='running')ctx.suspend()},
    resume(){if(ctx&&cur&&ctx.state==='suspended')ctx.resume()}
  };
  window.Music=Music;
})();
