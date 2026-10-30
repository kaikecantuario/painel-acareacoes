   
                                                                     
  
                                                                       
                                                                        
                                                                     
   
(function () {
  'use strict';

  function abertos() {
    return document.querySelectorAll('details.menu[open]');
  }

  function fecharTodos(exceto) {
    abertos().forEach(m => { if (m !== exceto) m.open = false; });
  }

  document.addEventListener('click', e => {
    const menu = e.target.closest('details.menu');

                                               
    if (!menu) { fecharTodos(null); return; }

                                    
    if (e.target.closest('summary')) { fecharTodos(menu); return; }

                                                         
    if (e.target.closest('.menu-painel .btn')) menu.open = false;
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') fecharTodos(null);
  });
})();
