interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export function isIosWebKit() {
  if (typeof window === "undefined") {
    return false;
  }

  const { userAgent, platform, maxTouchPoints } = window.navigator as NavigatorWithStandalone;
  const isAppleMobile = /iP(hone|ad|od)/.test(userAgent)
    || (platform === "MacIntel" && maxTouchPoints > 1);
  if (!isAppleMobile) {
    return false;
  }

  return !/(CriOS|FxiOS|EdgiOS)/.test(userAgent);
}
