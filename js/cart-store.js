/**
 * Carrinho partilhado entre index.html e produto.html (localStorage).
 */
(function (w) {
  var KEY = 'amina_cart_v1';

  w.aminaCartLoad = function () {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  };

  w.aminaCartSave = function (cart) {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch (e) {
      /* quota / privado */
    }
  };
})(window);
