const bookElement = document.getElementById("book");
const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const currentPageText = document.getElementById("current-page");
const totalPagesText = document.getElementById("total-pages");
const chapterLinks = Array.from(document.querySelectorAll(".chapter-link"));
const pages = Array.from(document.querySelectorAll(".page"));
const bookletFrame = document.querySelector(".booklet-frame");
const bookletApp = document.querySelector(".booklet-app");
const chapterPageMap = {
    about: 1,
    experience: 3,
    projects: 6,
    links: 16,
    contact: 17,
};

let pageFlipInstance = null;
let resizeTimeoutId = null;
let pageTurnZones = null;
let pageTurnInteraction = {
    activeDirection: null,
    activeZoneId: null,
    pointerId: null,
    isPointerDown: false,
    isDragging: false,
    previewVisible: false,
    previewOwnedByController: false,
    pressPoint: null,
    startPoint: null,
};

const DRAG_START_DISTANCE = 10;
const WHEEL_TURN_THRESHOLD = 60;
const WHEEL_TURN_COOLDOWN_MS = 500;
let lastWheelTurnAt = 0;
const STABLE_PREV_CORNER = "bottom";

function initializeLucideIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

function setPageFlipInstance(instance) {
    pageFlipInstance = instance;
    window.pageFlipInstance = instance;
}

function initializePageTurnZones() {
    if (!bookletFrame || pageTurnZones) {
        return;
    }

    const zonesRoot = document.createElement("div");
    zonesRoot.className = "page-turn-zones";
    zonesRoot.setAttribute("aria-hidden", "true");

    const zoneConfigs = [
        { id: "top-left", direction: "prev", corner: "top", label: "Previous page top corner" },
        { id: "bottom-left", direction: "prev", corner: "bottom", label: "Previous page bottom corner" },
        { id: "top-right", direction: "next", corner: "top", label: "Next page top corner" },
        { id: "bottom-right", direction: "next", corner: "bottom", label: "Next page bottom corner" },
    ];

    const zones = {};

    zoneConfigs.forEach((config) => {
        const zone = document.createElement("button");
        zone.type = "button";
        zone.className = "page-turn-zone";
        zone.dataset.zoneId = config.id;
        zone.dataset.direction = config.direction;
        zone.dataset.corner = config.corner;
        zone.tabIndex = -1;
        zone.setAttribute("aria-label", config.label);
        zone.addEventListener("pointerenter", () => handleCornerZoneHover(config.id));
        zone.addEventListener("pointerleave", () => handleCornerZoneLeave(config.id));
        zone.addEventListener("pointerdown", (event) => handleCornerZonePointerDown(event, config.id));
        zonesRoot.append(zone);
        zones[config.id] = zone;
    });

    bookletFrame.appendChild(zonesRoot);

    pageTurnZones = {
        root: zonesRoot,
        zones,
    };

    updatePageTurnZonePositions();
    initializeGlobalPageTurnEvents();
}

function initializeGlobalPageTurnEvents() {
    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);

    if (bookletApp) {
        bookletApp.addEventListener("wheel", handleBookletWheel, { passive: false });
    }
}

function updatePageTurnZonePositions() {
    if (!pageTurnZones || !bookletFrame) {
        return;
    }

    const frameRect = bookletFrame.getBoundingClientRect();
    const bounds = getPageFlipBounds();

    if (!frameRect || !bounds || !bounds.width || !bounds.height || !pageTurnZones.zones) {
        return;
    }

    const horizontalInset = 4;
    const verticalInset = 4;
    const leftOffset = Math.max(0, bounds.left - frameRect.left + horizontalInset);
    const rightOffset = Math.max(0, frameRect.right - (bounds.left + bounds.width) + horizontalInset);
    const topOffset = Math.max(0, bounds.top - frameRect.top + verticalInset);
    const bottomOffset = Math.max(0, frameRect.bottom - (bounds.top + bounds.height) + verticalInset);

    pageTurnZones.zones["top-left"].style.left = `${leftOffset}px`;
    pageTurnZones.zones["top-left"].style.top = `${topOffset}px`;
    pageTurnZones.zones["top-left"].style.right = "auto";
    pageTurnZones.zones["top-left"].style.bottom = "auto";

    pageTurnZones.zones["bottom-left"].style.left = `${leftOffset}px`;
    pageTurnZones.zones["bottom-left"].style.bottom = `${bottomOffset}px`;
    pageTurnZones.zones["bottom-left"].style.right = "auto";
    pageTurnZones.zones["bottom-left"].style.top = "auto";

    pageTurnZones.zones["top-right"].style.right = `${rightOffset}px`;
    pageTurnZones.zones["top-right"].style.top = `${topOffset}px`;
    pageTurnZones.zones["top-right"].style.left = "auto";
    pageTurnZones.zones["top-right"].style.bottom = "auto";

    pageTurnZones.zones["bottom-right"].style.right = `${rightOffset}px`;
    pageTurnZones.zones["bottom-right"].style.bottom = `${bottomOffset}px`;
    pageTurnZones.zones["bottom-right"].style.left = "auto";
    pageTurnZones.zones["bottom-right"].style.top = "auto";
}

function getPageFlipBounds() {
    if (!pageFlipInstance || typeof pageFlipInstance.getBoundsRect !== "function") {
        return null;
    }

    const bounds = pageFlipInstance.getBoundsRect();
    if (!bounds || typeof bounds.left !== "number" || typeof bounds.top !== "number") {
        return null;
    }

    return bounds;
}

function getLocalPointerPoint(event) {
    const bounds = getPageFlipBounds();

    if (!bounds) {
        return null;
    }

    const x = Math.min(Math.max(event.clientX - bounds.left, 1), Math.max(1, bounds.width - 1));
    const y = Math.min(Math.max(event.clientY - bounds.top, 1), Math.max(1, bounds.height - 1));

    return { x, y };
}

function getGlobalPointerPoint(event) {
    return {
        x: event.clientX,
        y: event.clientY,
    };
}

function getZoneById(zoneId) {
    if (!pageTurnZones || !pageTurnZones.zones) {
        return null;
    }

    return pageTurnZones.zones[zoneId] || null;
}

function getZoneMeta(zoneId) {
    const zone = getZoneById(zoneId);

    if (!zone) {
        return null;
    }

    return {
        zone,
        direction: zone.dataset.direction,
        corner: zone.dataset.corner,
    };
}

function getCornerGlobalPoint(zoneId) {
    const meta = getZoneMeta(zoneId);

    if (!meta) {
        return null;
    }

    return getCornerGlobalPointByDirection(meta.direction, meta.corner);
}

function getCornerGlobalPointByDirection(direction, corner) {
    const bounds = getPageFlipBounds();

    if (!bounds) {
        return null;
    }

    const inset = 8;
    return {
        x: direction === "prev" ? bounds.left + inset : bounds.left + bounds.width - inset,
        y: corner === "top" ? bounds.top + inset : bounds.top + bounds.height - inset,
    };
}

function getFlipController() {
    if (!pageFlipInstance || typeof pageFlipInstance.getFlipController !== "function") {
        return null;
    }

    const controller = pageFlipInstance.getFlipController();
    return controller || null;
}

function setCornerCue(zoneId, active) {
    if (!pageTurnZones || !pageTurnZones.zones) {
        return;
    }

    if (zoneId) {
        const zone = getZoneById(zoneId);
        if (zone) {
            zone.classList.toggle("is-active", active);
        }
    } else {
        Object.values(pageTurnZones.zones).forEach((zone) => {
            if (zone) {
                zone.classList.toggle("is-active", active);
            }
        });
    }
}

function handleCornerZoneHover(zoneId) {
    if (!pageTurnZones) {
        return;
    }

    const meta = getZoneMeta(zoneId);

    if (!meta || meta.zone.classList.contains("is-disabled")) {
        return;
    }

    pageTurnInteraction.activeDirection = meta.direction;
    pageTurnInteraction.activeZoneId = zoneId;
    setCornerCue(zoneId, true);
    showCornerPreview(zoneId);
}

function handleCornerZoneLeave(zoneId) {
    if (!pageTurnZones || pageTurnInteraction.isPointerDown) {
        return;
    }

    setCornerCue(zoneId, false);

    clearControllerPreview();

    if (!pageTurnInteraction.isPointerDown) {
        pageTurnInteraction.activeDirection = null;
        pageTurnInteraction.activeZoneId = null;
    }
}

function handleCornerZonePointerDown(event, zoneId) {
    event.preventDefault();
    event.stopPropagation();

    if (!pageTurnZones || !pageFlipInstance) {
        return;
    }

    const meta = getZoneMeta(zoneId);

    if (!meta || meta.zone.classList.contains("is-disabled")) {
        return;
    }

    pageTurnInteraction.activeDirection = meta.direction;
    pageTurnInteraction.activeZoneId = zoneId;
    pageTurnInteraction.pointerId = event.pointerId;
    pageTurnInteraction.isPointerDown = true;
    pageTurnInteraction.isDragging = false;
    pageTurnInteraction.pressPoint = {
        x: event.clientX,
        y: event.clientY,
    };
    pageTurnInteraction.startPoint = getCornerGlobalPoint(zoneId);
    if (typeof meta.zone.setPointerCapture === "function") {
        try {
            meta.zone.setPointerCapture(event.pointerId);
        } catch (error) {
            console.warn("pointer capture failed", error);
        }
    }

    setCornerCue(zoneId, true);
    showCornerPreview(zoneId);
}

function handleGlobalPointerMove(event) {
    if (
        !pageTurnInteraction.isPointerDown ||
        !pageTurnInteraction.activeDirection ||
        (pageTurnInteraction.pointerId !== null && event.pointerId !== pageTurnInteraction.pointerId)
    ) {
        return;
    }

    const localPoint = getLocalPointerPoint(event);

    if (!localPoint) {
        return;
    }

    if (pageTurnInteraction.activeDirection === "prev") {
        return;
    }

    if (!pageTurnInteraction.isDragging && pageTurnInteraction.pressPoint) {
        const distance = Math.hypot(
            event.clientX - pageTurnInteraction.pressPoint.x,
            event.clientY - pageTurnInteraction.pressPoint.y
        );

        if (distance >= DRAG_START_DISTANCE) {
            startCornerDrag();
        }
    }

    if (pageTurnInteraction.isDragging) {
        try {
            const controller = getFlipController();
            const globalPoint = getGlobalPointerPoint(event);
            if (controller && typeof controller.fold === "function") {
                controller.fold(globalPoint);
            }
        } catch (error) {
            console.warn("corner drag move failed", error);
        }
    }
}

function showCornerPreview(zoneId) {
    const controller = getFlipController();
    const globalPoint = getCornerGlobalPoint(zoneId);

    if (!controller || !globalPoint || typeof controller.showCorner !== "function") {
        return;
    }

    try {
        controller.showCorner(globalPoint);
        pageTurnInteraction.previewVisible = true;
        pageTurnInteraction.previewOwnedByController = true;
    } catch (error) {
        console.warn("corner preview failed", error);
        pageTurnInteraction.previewVisible = false;
        pageTurnInteraction.previewOwnedByController = false;
    }
}

function clearVisualPreview() {
    setCornerCue(null, false);
    pageTurnInteraction.previewVisible = false;
    pageTurnInteraction.previewOwnedByController = false;
}

function clearControllerPreview() {
    if (!pageTurnInteraction.previewOwnedByController && !pageTurnInteraction.isDragging) {
        pageTurnInteraction.previewVisible = false;
        return;
    }

    const controller = getFlipController();

    if (controller && typeof controller.stopMove === "function") {
        try {
            controller.stopMove();
        } catch (error) {
            console.warn("corner preview clear failed", error);
        }
    }

    pageTurnInteraction.previewVisible = false;
    pageTurnInteraction.previewOwnedByController = false;
}

function startCornerDrag() {
    if (
        !pageFlipInstance ||
        pageTurnInteraction.isDragging ||
        !pageTurnInteraction.startPoint
    ) {
        return;
    }

    const controller = getFlipController();

    if (!controller || typeof controller.start !== "function") {
        return;
    }

    try {
        const didStart = controller.start(pageTurnInteraction.startPoint);
        pageTurnInteraction.isDragging = Boolean(didStart);
        pageTurnInteraction.previewVisible = false;
        pageTurnInteraction.previewOwnedByController = pageTurnInteraction.isDragging;
    } catch (error) {
        console.warn("corner drag start failed", error);
    }
}

function completeCornerClick(direction) {
    if (!pageFlipInstance) {
        return;
    }

    const meta = pageTurnInteraction.activeZoneId ? getZoneMeta(pageTurnInteraction.activeZoneId) : null;
    const corner = meta ? meta.corner : "bottom";

    if (direction === "prev") {
        turnPage("prev", corner);
    } else {
        turnPage("next", corner);
    }
}

function resetCornerInteraction() {
    pageTurnInteraction.activeDirection = null;
    pageTurnInteraction.activeZoneId = null;
    pageTurnInteraction.pointerId = null;
    pageTurnInteraction.isPointerDown = false;
    pageTurnInteraction.isDragging = false;
    pageTurnInteraction.previewVisible = false;
    pageTurnInteraction.previewOwnedByController = false;
    pageTurnInteraction.pressPoint = null;
    pageTurnInteraction.startPoint = null;
}

function handleGlobalPointerUp(event) {
    if (
        !pageTurnInteraction.isPointerDown ||
        !pageTurnInteraction.activeDirection ||
        (pageTurnInteraction.pointerId !== null && event.pointerId !== pageTurnInteraction.pointerId)
    ) {
        return;
    }

    const direction = pageTurnInteraction.activeDirection;

    if (pageTurnInteraction.isDragging) {
        try {
            clearControllerPreview();
        } catch (error) {
            console.warn("corner drag stop failed", error);
        }
    } else {
        completeCornerClick(direction);
    }

    clearVisualPreview();
    resetCornerInteraction();
}

function canTurnPrev() {
    if (!pageFlipInstance || typeof pageFlipInstance.getCurrentPageIndex !== "function") {
        return false;
    }

    return pageFlipInstance.getCurrentPageIndex() > 0;
}

function canTurnNext() {
    if (
        !pageFlipInstance ||
        typeof pageFlipInstance.getCurrentPageIndex !== "function" ||
        typeof pageFlipInstance.getPageCount !== "function"
    ) {
        return false;
    }

    return pageFlipInstance.getCurrentPageIndex() < pageFlipInstance.getPageCount() - 1;
}

function turnPage(direction, corner = "bottom") {
    if (!pageFlipInstance) {
        return;
    }

    if (direction === "prev") {
        if (!canTurnPrev()) {
            return;
        }

        const controller = getFlipController();
        const globalPoint = getCornerGlobalPointByDirection("prev", corner);

        if (!controller || !globalPoint || typeof controller.flip !== "function") {
            return;
        }

        try {
            controller.flip(globalPoint);
        } catch (error) {
            console.warn("previous controller flip failed", error);
        }
        return;
    }

    if (direction === "next" && canTurnNext() && typeof pageFlipInstance.flipNext === "function") {
        pageFlipInstance.flipNext(corner);
    }
}

function handleBookletWheel(event) {
    if (!pageFlipInstance || pageTurnInteraction.isPointerDown || pageTurnInteraction.isDragging) {
        return;
    }

    const now = Date.now();
    const deltaY = event.deltaY;

    if (Math.abs(deltaY) < WHEEL_TURN_THRESHOLD) {
        return;
    }

    if (now - lastWheelTurnAt < WHEEL_TURN_COOLDOWN_MS) {
        event.preventDefault();
        return;
    }

    if (deltaY > 0) {
        if (!canTurnNext()) {
            return;
        }

        event.preventDefault();
        lastWheelTurnAt = now;
        turnPage("next", "bottom");
        return;
    }

    if (!canTurnPrev()) {
        return;
    }

    event.preventDefault();
    lastWheelTurnAt = now;
    turnPage("prev", STABLE_PREV_CORNER);
}

function updatePageTurnZones() {
    if (!pageFlipInstance || !pageTurnZones) {
        return;
    }

    const currentPage = typeof pageFlipInstance.getCurrentPageIndex === "function"
        ? pageFlipInstance.getCurrentPageIndex()
        : 0;
    const totalPages = typeof pageFlipInstance.getPageCount === "function"
        ? pageFlipInstance.getPageCount()
        : pages.length;

    if (pageTurnZones.zones) {
        pageTurnZones.zones["top-left"].classList.toggle("is-disabled", currentPage <= 0);
        pageTurnZones.zones["bottom-left"].classList.toggle("is-disabled", currentPage <= 0);
        pageTurnZones.zones["top-right"].classList.toggle("is-disabled", currentPage >= totalPages - 1);
        pageTurnZones.zones["bottom-right"].classList.toggle("is-disabled", currentPage >= totalPages - 1);
    }

    clearVisualPreview();
    resetCornerInteraction();
    updatePageTurnZonePositions();
}

function updatePageDisplay(pageFlip) {
    if (!pageFlip || !currentPageText || !totalPagesText) {
        return;
    }

    const currentPage = pageFlip.getCurrentPageIndex() + 1;
    const totalPages = pageFlip.getPageCount();

    currentPageText.textContent = currentPage;
    totalPagesText.textContent = totalPages;
}

function updateActiveChapter(pageIndex) {
    if (!pages.length || !chapterLinks.length) {
        return;
    }

    const currentPage = pages[pageIndex];
    const chapterName = currentPage ? currentPage.dataset.chapter : "";

    chapterLinks.forEach((link) => {
        const isActive = chapterName && link.dataset.chapter === chapterName;
        link.classList.toggle("active", isActive);
    });
}

function goToChapter(chapterName) {
    if (!pageFlipInstance) {
        console.log("PageFlip is not ready yet");
        return;
    }

    const targetPage = chapterPageMap[chapterName];

    if (typeof targetPage !== "number") {
        console.log("No mapped page for chapter:", chapterName);
        return;
    }

    const currentPageIndex = typeof pageFlipInstance.getCurrentPageIndex === "function"
        ? pageFlipInstance.getCurrentPageIndex()
        : 0;
    const corner = targetPage < currentPageIndex ? "bottom" : "top";

    if (typeof pageFlipInstance.flip === "function") {
        try {
            pageFlipInstance.flip(targetPage, corner);
            return;
        } catch (error) {
            console.warn("animated chapter flip failed, falling back to turnToPage", error);
        }
    }

    if (typeof pageFlipInstance.turnToPage === "function") {
        pageFlipInstance.turnToPage(targetPage);
        updatePageDisplay(pageFlipInstance);
        updateActiveChapter(targetPage);
        updatePageTurnZones();
    }
}

function getPageFlipSettings(startPage = 0) {
    const topbar = document.querySelector(".topbar");
    const availableHeight = window.innerHeight - (topbar ? topbar.offsetHeight : 64);
    const isPhone = window.innerWidth <= 640;

    return {
        width: isPhone ? 320 : 540,
        height: Math.max(isPhone ? 420 : 560, Math.floor(availableHeight)),
        size: "stretch",
        minWidth: isPhone ? 260 : 320,
        maxWidth: isPhone ? 480 : 1200,
        minHeight: isPhone ? 360 : 460,
        maxHeight: Math.max(isPhone ? 420 : 560, Math.floor(availableHeight)),
        maxShadowOpacity: 0.45,
        showCover: false,
        mobileScrollSupport: false,
        usePortrait: true,
        useMouseEvents: false,
        clickEventForward: true,
        disableFlipByClick: true,
        startPage,
        flippingTime: 760,
        drawShadow: true,
    };
}

function createPageFlip(startPage = 0) {
    if (!(window.St && window.St.PageFlip && bookElement)) {
        console.log("StPageFlip failed to load");
        return null;
    }

    const instance = new window.St.PageFlip(bookElement, getPageFlipSettings(startPage));

    instance.loadFromHTML(pages);
    setPageFlipInstance(instance);
    updatePageDisplay(instance);
    updateActiveChapter(instance.getCurrentPageIndex());
    updatePageTurnZones();

    instance.on("flip", () => {
        clearControllerPreview();
        clearVisualPreview();
        updatePageDisplay(instance);
        updateActiveChapter(instance.getCurrentPageIndex());
        updatePageTurnZones();
    });

    instance.on("changeOrientation", () => {
        clearControllerPreview();
        clearVisualPreview();
        updatePageDisplay(instance);
        updateActiveChapter(instance.getCurrentPageIndex());
        updatePageTurnZones();
    });

    return instance;
}

function rebuildPageFlip() {
    const currentPage = pageFlipInstance ? pageFlipInstance.getCurrentPageIndex() : 0;

    if (pageFlipInstance) {
        pageFlipInstance.destroy();
        pageFlipInstance = null;
    }

    createPageFlip(currentPage);
}

if (window.St && window.St.PageFlip && bookElement) {
    initializeLucideIcons();
    initializePageTurnZones();
    createPageFlip(0);

    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeoutId);
        resizeTimeoutId = setTimeout(() => {
            rebuildPageFlip();
        }, 150);
    });

    prevButton.addEventListener("click", () => {
        if (pageFlipInstance) {
            turnPage("prev", STABLE_PREV_CORNER);
        }
    });

    nextButton.addEventListener("click", () => {
        if (pageFlipInstance) {
            turnPage("next", "bottom");
        }
    });

    chapterLinks.forEach((link) => {
        link.addEventListener("click", () => {
            goToChapter(link.dataset.chapter);
        });
    });
} else {
    initializeLucideIcons();
    initializePageTurnZones();
    console.log("StPageFlip failed to load");
    currentPageText.textContent = "1";
    totalPagesText.textContent = String(pages.length);

    if (prevButton) {
        prevButton.disabled = true;
    }

    if (nextButton) {
        nextButton.disabled = true;
    }
}
