import type { AppSessionState } from "../hooks/use-app-session";
import { SectionHeading } from "../../ui/section-heading";

interface AuthScreenProps {
  session: AppSessionState;
}

export function AuthScreen({ session }: AuthScreenProps) {
  return (
    <section className="pageStack">
      <article className="panel landingHero panelStack">
        <div>
          <p className="eyebrow">欢迎</p>
          <h2>把宝宝的照片，留在自己手里。</h2>
          <p className="helperText">注册后可以输入邀请码加入已有相册，或者创建属于自己宝宝的第一本相册。</p>
        </div>
        <div className="tagRow">
          <span className="tag">移动端优先</span>
          <span className="tag">按拍摄日期整理</span>
          <span className="tag">成员权限管理</span>
        </div>
      </article>

      <section className="gridColumns">
        <article className="panelStack panel">
          <SectionHeading eyebrow="账号" title={session.authMode === "login" ? "登录" : "注册"} />
          <div aria-label="登录或注册" className="segmentedControl" role="tablist">
            <button
              aria-selected={session.authMode === "login"}
              className={`segmentedControlButton${session.authMode === "login" ? " segmentedControlButtonActive" : ""}`}
              onClick={() => session.setAuthMode("login")}
              type="button"
            >
              登录
            </button>
            <button
              aria-selected={session.authMode === "register"}
              className={`segmentedControlButton${session.authMode === "register" ? " segmentedControlButtonActive" : ""}`}
              onClick={() => session.setAuthMode("register")}
              type="button"
            >
              注册
            </button>
          </div>

          {session.authMode === "register" ? (
            <form className="formGrid" onSubmit={session.handleRegister}>
              <label>
                你的称呼
                <input value={session.registerName} onChange={(event) => session.setRegisterName(event.target.value)} />
              </label>
              <label>
                邮箱
                <input type="email" value={session.registerEmail} onChange={(event) => session.setRegisterEmail(event.target.value)} />
              </label>
              <label>
                密码
                <input type="password" value={session.registerPassword} onChange={(event) => session.setRegisterPassword(event.target.value)} />
              </label>
              <button type="submit">注册并继续</button>
            </form>
          ) : (
            <form className="formGrid" onSubmit={session.handleLogin}>
              <label>
                邮箱
                <input type="email" value={session.loginEmail} onChange={(event) => session.setLoginEmail(event.target.value)} />
              </label>
              <label>
                密码
                <input type="password" value={session.loginPassword} onChange={(event) => session.setLoginPassword(event.target.value)} />
              </label>
              <button type="submit">登录</button>
            </form>
          )}
        </article>
      </section>
    </section>
  );
}
