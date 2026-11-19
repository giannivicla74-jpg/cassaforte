// Applica tema e colore scelti prima che la pagina venga disegnata (evita il lampo del tema sbagliato)
(function(){try{
  var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);
  var a=localStorage.getItem('accent');if(a==='smeraldo'||a==='rubino'||a==='zaffiro'||a==='ametista')document.documentElement.setAttribute('data-accent',a);
}catch(e){}})();
