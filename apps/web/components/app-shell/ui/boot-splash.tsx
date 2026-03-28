interface BootSplashProps {
  phase: "loading" | "exiting";
}

export function BootSplash({ phase }: BootSplashProps) {
  return (
    <div aria-hidden="true" className={`bootSplash bootSplash${phase === "exiting" ? " bootSplashExiting" : ""}`}>
      <div className="bootSplashBackdrop" />
      <div className="bootSplashPanel">
        <span className="bootSplashMark">宝</span>
        <div className="bootSplashCopy">
          <strong>宝宝相册</strong>
        </div>
        <div className="bootSplashLoader">
          <span className="bootSplashLoaderBar" />
        </div>
      </div>
    </div>
  );
}
