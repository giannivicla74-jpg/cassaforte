// Applica il tema scelto prima che la pagina venga disegnata (evita il lampo del tema sbagliato)
(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}})();
