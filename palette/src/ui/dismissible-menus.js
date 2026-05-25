const DEFAULT_MENU_SELECTOR = "details.toolbar-menu, details.capture-options";

function targetIsInsideMenu(menu, target) {
  if (!target) return false;
  if (target === menu) return true;
  return typeof menu.contains === "function" && menu.contains(target);
}

function menuSummary(menu) {
  return typeof menu.querySelector === "function" ? menu.querySelector("summary") : null;
}

function syncExpandedState(menu) {
  const summary = menuSummary(menu);
  if (summary && typeof summary.setAttribute === "function") {
    summary.setAttribute("aria-expanded", menu.open ? "true" : "false");
  }
}

export function bindDismissibleMenus({
  root = globalThis.document,
  selector = DEFAULT_MENU_SELECTOR
} = {}) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return {menus: [], closeAll() {}, destroy() {}};
  }

  const menus = Array.from(root.querySelectorAll(selector)).filter(Boolean);

  function closeAll(except = null) {
    menus.forEach(menu => {
      if (menu !== except && menu.open) {
        menu.open = false;
      }
      syncExpandedState(menu);
    });
  }

  function clickIsInsideOpenMenu(target) {
    return menus.some(menu => menu.open && targetIsInsideMenu(menu, target));
  }

  function handleDocumentClick(event) {
    if (!clickIsInsideOpenMenu(event.target)) {
      closeAll();
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      closeAll();
    }
  }

  function handleToggle(event) {
    const menu = event.currentTarget || event.target;
    if (menu?.open) closeAll(menu);
    if (menu) syncExpandedState(menu);
  }

  menus.forEach(menu => {
    syncExpandedState(menu);
    if (typeof menu.addEventListener === "function") {
      menu.addEventListener("toggle", handleToggle);
    }
  });

  if (typeof root.addEventListener === "function") {
    root.addEventListener("click", handleDocumentClick, true);
    root.addEventListener("keydown", handleKeydown, true);
  }

  return {
    menus,
    closeAll,
    destroy() {
      if (typeof root.removeEventListener === "function") {
        root.removeEventListener("click", handleDocumentClick, true);
        root.removeEventListener("keydown", handleKeydown, true);
      }
      menus.forEach(menu => {
        if (typeof menu.removeEventListener === "function") {
          menu.removeEventListener("toggle", handleToggle);
        }
      });
    }
  };
}
