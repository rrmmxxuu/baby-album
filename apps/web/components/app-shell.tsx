"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UploadComposer } from "./upload-composer";
import { acceptInvite, createBaby, createFamily, createInvite, deleteBaby, getApiBaseUrl, getPreviewUrl, leaveFamily, loadAppState, loadInvite, loginUser, logoutUser, registerUser, updateMemberRole } from "../lib/api";
import type { AppStatePayload, FamilyInvite, FamilyMember, MediaAsset, Role } from "../lib/types";

type TabKey = "photos" | "upload" | "settings";
type AuthMode = "login" | "register";

const TOKEN_STORAGE_KEY = "baby-album.authToken";
const FAMILY_STORAGE_KEY = "baby-album.familyId";

function AppShellInner() {
  const searchParams = useSearchParams();
  const queryInviteCode = searchParams.get("invite") ?? "";
  const apiBaseUrl = getApiBaseUrl();

  const [origin, setOrigin] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [activeTab, setActiveTab] = useState<TabKey>("photos");
  const [authToken, setAuthToken] = useState("");
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [appState, setAppState] = useState<AppStatePayload | null>(null);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [invite, setInvite] = useState<FamilyInvite | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({});
  const [ownerTransferTarget, setOwnerTransferTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [babyName, setBabyName] = useState("");
  const [babyBirthDate, setBabyBirthDate] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");

  useEffect(() => {
    setHydrated(true);
    setOrigin(window.location.origin);
    setAuthToken(window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
    setSelectedFamilyId(window.localStorage.getItem(FAMILY_STORAGE_KEY) ?? "");
    setInviteCodeInput(queryInviteCode);
  }, [queryInviteCode]);

  useEffect(() => {
    const code = inviteCodeInput.trim();
    if (!code) {
      setInvite(null);
      return;
    }
    let cancelled = false;
    loadInvite(code)
      .then((value) => {
        if (!cancelled) {
          setInvite(value);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setInvite(null);
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCodeInput]);

  useEffect(() => {
    if (!hydrated || !authToken) {
      return;
    }
    void refreshApp(selectedFamilyId || undefined);
  }, [hydrated, authToken, selectedFamilyId]);

  useEffect(() => {
    const members = appState?.activeFamily?.members ?? [];
    const drafts: Record<string, Role> = {};
    for (const member of members) {
      drafts[member.userId] = member.role;
    }
    setRoleDrafts(drafts);
    if (!appState?.activeFamily) {
      setActiveTab("photos");
    }
  }, [appState]);

  async function refreshApp(targetFamilyId?: string) {
    if (!authToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loadAppState(authToken, targetFamilyId);
      setAppState(next);
      const familyId = next.activeFamilyId ?? "";
      setSelectedFamilyId(familyId);
      if (familyId) {
        window.localStorage.setItem(FAMILY_STORAGE_KEY, familyId);
      } else {
        window.localStorage.removeItem(FAMILY_STORAGE_KEY);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载数据失败。";
      setError(message);
      if (message.includes("unauthorized")) {
        clearSession(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function saveSession(token: string) {
    setAuthToken(token);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  function clearSession(showNotice = true) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(FAMILY_STORAGE_KEY);
    setAuthToken("");
    setSelectedFamilyId("");
    setAppState(null);
    setActiveTab("photos");
    if (showNotice) {
      setNotice("已退出登录。")
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const auth = await registerUser({ displayName: registerName, email: registerEmail, password: registerPassword });
      saveSession(auth.token);
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setNotice(`欢迎，${auth.user.displayName}。请继续加入已有相册，或创建第一个宝宝相册。`);
      await refreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败。")
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const auth = await loginUser({ email: loginEmail, password: loginPassword });
      saveSession(auth.token);
      setLoginEmail("");
      setLoginPassword("");
      setNotice(`欢迎回来，${auth.user.displayName}。`);
      await refreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败。")
    }
  }

  async function handleLogout() {
    try {
      if (authToken) {
        await logoutUser(authToken);
      }
    } catch {
      // Ignore server-side logout failures and keep local logout deterministic.
    }
    clearSession();
  }

  async function handleCreateAlbum(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const name = babyName.trim();
      if (!name) {
        throw new Error("请先填写宝宝姓名。")
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
      const family = await createFamily(authToken, { name: `${name}的宝宝相册`, timezone });
      await createBaby(authToken, family.id, {
        name,
        birthDate: babyBirthDate ? new Date(`${babyBirthDate}T00:00:00Z`).toISOString() : undefined
      });
      setBabyName("");
      setBabyBirthDate("");
      setSelectedFamilyId(family.id);
      window.localStorage.setItem(FAMILY_STORAGE_KEY, family.id);
      setNotice("宝宝相册已创建。")
      await refreshApp(family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建宝宝相册失败。")
    }
  }

  async function handleAcceptInvite(code?: string) {
    if (!authToken) {
      return;
    }
    const inviteCode = (code ?? inviteCodeInput).trim();
    if (!inviteCode) {
      setError("请输入邀请码。")
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const accepted = await acceptInvite(authToken, inviteCode);
      setSelectedFamilyId(accepted.familyId);
      window.localStorage.setItem(FAMILY_STORAGE_KEY, accepted.familyId);
      setNotice(`已加入 ${accepted.familyName ?? "宝宝相册"}。`);
      await refreshApp(accepted.familyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入相册失败。")
    }
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken || !appState?.activeFamily) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const created = await createInvite(authToken, appState.activeFamily.family.id, inviteRole);
      setNotice(`已生成邀请码：${created.code}`);
      await refreshApp(appState.activeFamily.family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建邀请码失败。")
    }
  }

  async function handleRoleUpdate(memberUserId: string) {
    if (!authToken || !appState?.activeFamily) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const nextRole = roleDrafts[memberUserId];
      await updateMemberRole(authToken, appState.activeFamily.family.id, memberUserId, nextRole);
      setNotice(`已更新成员权限：${roleLabel(nextRole)}。`);
      await refreshApp(appState.activeFamily.family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新成员权限失败。")
    }
  }

  async function handleDeleteBaby(babyId: string) {
    if (!authToken || !appState?.activeFamily) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await deleteBaby(authToken, appState.activeFamily.family.id, babyId);
      setNotice("已删除宝宝档案。")
      await refreshApp(appState.activeFamily.family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除宝宝档案失败。")
    }
  }

  async function handleLeaveFamily() {
    if (!authToken || !appState?.activeFamily) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await leaveFamily(authToken, appState.activeFamily.family.id, ownerTransferTarget || undefined);
      setOwnerTransferTarget("");
      setNotice("你已退出当前宝宝相册。")
      await refreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出相册失败。")
    }
  }

  const activeFamily = appState?.activeFamily ?? null;
  const currentUser = appState?.currentUser ?? null;
  const familyBabies = activeFamily?.babies ?? [];
  const familyTimeline = activeFamily?.timeline ?? [];
  const familyMembers = activeFamily?.members ?? [];
  const familyInvites = activeFamily?.invites ?? [];
  const canManageInvites = activeFamily?.membership.role === "owner" || activeFamily?.membership.role === "admin";
  const canDeleteBaby = activeFamily?.membership.role === "owner" || activeFamily?.membership.role === "admin";
  const timelineGroups = useMemo(() => groupTimeline(familyTimeline), [familyTimeline]);
  const transferCandidates = familyMembers.filter((member) => member.userId !== currentUser?.id);
  const inviteLink = invite && invite.code ? `${origin}/?invite=${invite.code}` : "";

  return (
    <main className="appShell">
      <section className="topBar panel">
        <div>
          <p className="eyebrow">宝宝相册</p>
          <h1>宝宝相册</h1>
          <p className="helperText">自部署、重视隐私的宝宝照片与视频时间线。</p>
        </div>
        {currentUser ? (
          <div className="sessionBadge">
            <strong>{currentUser.displayName}</strong>
            <span>{currentUser.email}</span>
          </div>
        ) : null}
      </section>

      {notice ? <p className="noticeBanner">{notice}</p> : null}
      {error ? <p className="errorBanner">{error}</p> : null}

      {!authToken ? (
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
              <span className="tag">家庭成员权限管理</span>
            </div>
          </article>

          <section className="gridColumns">
            <article className="panelStack panel">
              <div className="sectionHeading">
                <div>
                  <p className="eyebrow">账号</p>
                  <h2>{authMode === "login" ? "登录" : "注册"}</h2>
                </div>
                <button className="secondaryButton" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} type="button">
                  {authMode === "login" ? "去注册" : "去登录"}
                </button>
              </div>

              {authMode === "register" ? (
                <form className="formGrid" onSubmit={handleRegister}>
                  <label>
                    你的称呼
                    <input value={registerName} onChange={(event) => setRegisterName(event.target.value)} />
                  </label>
                  <label>
                    邮箱
                    <input type="email" value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} />
                  </label>
                  <label>
                    密码
                    <input type="password" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} />
                  </label>
                  <button type="submit">注册并继续</button>
                </form>
              ) : (
                <form className="formGrid" onSubmit={handleLogin}>
                  <label>
                    邮箱
                    <input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
                  </label>
                  <label>
                    密码
                    <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
                  </label>
                  <button type="submit">登录</button>
                </form>
              )}
            </article>

            <article className="panelStack panel">
              <div className="sectionHeading">
                <div>
                  <p className="eyebrow">邀请码</p>
                  <h2>已有邀请？</h2>
                </div>
              </div>
              <label>
                输入邀请码
                <input value={inviteCodeInput} onChange={(event) => setInviteCodeInput(event.target.value)} placeholder="例如：a1b2c3d4e5f6" />
              </label>
              {invite ? <InviteCard invite={invite} origin={origin} mode="preview" /> : <p className="helperText">如果你已经拿到了邀请码，可以先填入。登录后即可加入对应宝宝相册。</p>}
            </article>
          </section>
        </section>
      ) : null}

      {authToken && !activeFamily && !loading ? (
        <section className="gridColumns">
          <article className="panelStack panel">
            <div className="sectionHeading">
              <div>
                <p className="eyebrow">加入相册</p>
                <h2>输入邀请码</h2>
              </div>
            </div>
            <label>
              邀请码
              <input value={inviteCodeInput} onChange={(event) => setInviteCodeInput(event.target.value)} placeholder="请输入邀请码" />
            </label>
            {invite ? <InviteCard invite={invite} origin={origin} mode="accept" /> : <p className="helperText">如果家人已经创建了宝宝相册，可以先让对方发你邀请码。</p>}
            <button onClick={() => void handleAcceptInvite()} type="button">加入已有相册</button>
          </article>

          <article className="panelStack panel">
            <div className="sectionHeading">
              <div>
                <p className="eyebrow">创建相册</p>
                <h2>创建第一个宝宝相册</h2>
              </div>
            </div>
            <form className="formGrid" onSubmit={handleCreateAlbum}>
              <label>
                宝宝姓名
                <input value={babyName} onChange={(event) => setBabyName(event.target.value)} />
              </label>
              <label>
                出生日期
                <input type="date" value={babyBirthDate} onChange={(event) => setBabyBirthDate(event.target.value)} />
              </label>
              <button type="submit">创建宝宝相册</button>
            </form>
            <p className="helperText">系统会自动为这个宝宝创建一个相册空间，并将你设为所有者。</p>
          </article>
        </section>
      ) : null}

      {authToken && activeFamily ? (
        <>
          <section className="summaryGrid">
            <article className="metricCard panel"><span>当前相册</span><strong>{activeFamily.family.name}</strong></article>
            <article className="metricCard panel"><span>我的身份</span><strong>{roleLabel(activeFamily.membership.role)}</strong></article>
            <article className="metricCard panel"><span>宝宝数量</span><strong>{familyBabies.length}</strong></article>
            <article className="metricCard panel"><span>媒体数量</span><strong>{familyTimeline.length}</strong></article>
          </section>

          {activeTab === "photos" ? (
            <section className="pageStack">
              <article className="panelStack panel">
                <div className="sectionHeading">
                  <div>
                    <p className="eyebrow">照片时间线</p>
                    <h2>按拍摄日期整理</h2>
                  </div>
                  <span className="pill">{familyTimeline.length} 项</span>
                </div>
                <div className="tagRow">
                  {familyBabies.map((baby) => (
                    <span className="tag" key={baby.id}>{baby.name}{baby.birthDate ? ` / ${formatDate(baby.birthDate)}` : ""}</span>
                  ))}
                </div>
                <div className="timelineGroups">
                  {timelineGroups.length === 0 ? <p className="helperText">还没有媒体内容，先去上传一张照片吧。</p> : timelineGroups.map(([day, items]) => (
                    <article className="timelineDay" key={day}>
                      <header><h3>{day}</h3><p>{items.length} 项</p></header>
                      <div className="timelineItems">
                        {items.map((item) => <TimelineItem authToken={authToken} familyId={activeFamily.family.id} item={item} key={item.id} />)}
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "upload" ? (
            <section className="gridColumns">
              <UploadComposer apiBaseUrl={apiBaseUrl} authToken={authToken} familyId={activeFamily.family.id} disabled={!activeFamily.storageNode} onUploaded={() => void refreshApp(activeFamily.family.id)} />
              <article className="panelStack panel">
                <div className="sectionHeading">
                  <div>
                    <p className="eyebrow">存储节点</p>
                    <h2>{activeFamily.storageNode ? activeFamily.storageNode.name : "尚未连接存储节点"}</h2>
                  </div>
                  <span className={`pill ${activeFamily.storageNode?.status === "online" ? "pillOnline" : ""}`}>{activeFamily.storageNode?.status === "online" ? "在线" : "离线"}</span>
                </div>
                {activeFamily.storageNode ? <p className="helperText">最近心跳：{formatDateTime(activeFamily.storageNode.lastSeenAt)}</p> : <p className="helperText">上传功能依赖家庭存储节点，请先完成配对。</p>}
              </article>
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className="pageStack">
              <div className="gridColumns">
                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">账号</p><h2>当前登录</h2></div></div>
                  <p><strong>{currentUser?.displayName}</strong></p>
                  <p className="helperText">{currentUser?.email}</p>
                  <p className="helperText">当前身份：{roleLabel(activeFamily.membership.role)}</p>
                  <button className="secondaryButton" onClick={handleLogout} type="button">退出登录</button>
                </article>

                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">邀请</p><h2>邀请家人加入</h2></div></div>
                  {canManageInvites ? (
                    <>
                      <form className="inlineForm" onSubmit={handleCreateInvite}>
                        <label>
                          邀请权限
                          <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
                            <option value="viewer">仅查看</option>
                            <option value="member">可上传</option>
                            <option value="admin">管理员</option>
                          </select>
                        </label>
                        <button type="submit">生成邀请码</button>
                      </form>
                      <div className="stackList">
                        {familyInvites.length === 0 ? <p className="helperText">还没有生成邀请码。</p> : null}
                        {familyInvites.map((item) => <InviteCard invite={item} key={item.id} mode="manage" origin={origin} />)}
                      </div>
                    </>
                  ) : <p className="helperText">只有 owner 或管理员可以生成邀请码。</p>}
                </article>
              </div>

              <div className="gridColumns">
                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">宝宝档案</p><h2>相册中的宝宝</h2></div></div>
                  <div className="stackList">
                    {familyBabies.length === 0 ? <p className="helperText">还没有宝宝档案。</p> : null}
                    {familyBabies.map((baby) => (
                      <div className="memberRow" key={baby.id}>
                        <div>
                          <strong>{baby.name}</strong>
                          <p className="helperText">{baby.birthDate ? formatDate(baby.birthDate) : "未填写出生日期"}</p>
                        </div>
                        {canDeleteBaby ? <button className="secondaryButton" onClick={() => void handleDeleteBaby(baby.id)} type="button">删除</button> : null}
                      </div>
                    ))}
                  </div>
                  <form className="formGrid compactForm" onSubmit={handleCreateAlbum}>
                    <label>
                      新增宝宝姓名
                      <input value={babyName} onChange={(event) => setBabyName(event.target.value)} />
                    </label>
                    <label>
                      出生日期
                      <input type="date" value={babyBirthDate} onChange={(event) => setBabyBirthDate(event.target.value)} />
                    </label>
                    <button onClick={(event) => { event.preventDefault(); void handleCreateBabyFromSettings(authToken, activeFamily.family.id, babyName, babyBirthDate, setBabyName, setBabyBirthDate, setNotice, setError, refreshApp); }} type="button">新增宝宝档案</button>
                  </form>
                </article>

                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">成员权限</p><h2>相册成员</h2></div></div>
                  <div className="stackList">
                    {familyMembers.map((member) => (
                      <MemberRow
                        canEdit={Boolean(activeFamily.membership.role === "owner" && currentUser && member.userId !== currentUser.id && member.role !== "owner")}
                        draftRole={roleDrafts[member.userId] ?? member.role}
                        key={member.userId}
                        member={member}
                        onChange={(role) => setRoleDrafts((current) => ({ ...current, [member.userId]: role }))}
                        onSave={() => void handleRoleUpdate(member.userId)}
                      />
                    ))}
                  </div>
                </article>
              </div>

              <article className="panelStack panel">
                <div className="sectionHeading"><div><p className="eyebrow">退出相册</p><h2>{activeFamily.membership.role === "owner" ? "转让 owner 后退出" : "退出当前相册"}</h2></div></div>
                {activeFamily.membership.role === "owner" ? (
                  transferCandidates.length > 0 ? (
                    <>
                      <label>
                        选择新的 owner
                        <select value={ownerTransferTarget} onChange={(event) => setOwnerTransferTarget(event.target.value)}>
                          <option value="">请选择成员</option>
                          {transferCandidates.map((member) => <option key={member.userId} value={member.userId}>{member.displayName} / {roleLabel(member.role)}</option>)}
                        </select>
                      </label>
                      <button onClick={() => void handleLeaveFamily()} type="button">转让并退出</button>
                    </>
                  ) : <p className="helperText">当前没有其他成员，owner 暂时不能直接退出。</p>
                ) : (
                  <button className="secondaryButton" onClick={() => void handleLeaveFamily()} type="button">退出当前相册</button>
                )}
              </article>
            </section>
          ) : null}
        </>
      ) : null}

      {loading ? <p className="helperText loadingRow">正在同步最新状态...</p> : null}

      {authToken && activeFamily ? (
        <nav className="bottomNav">
          <button className={activeTab === "photos" ? "navActive" : ""} onClick={() => setActiveTab("photos")} type="button">照片</button>
          <button className={activeTab === "upload" ? "navActive" : ""} onClick={() => setActiveTab("upload")} type="button">上传</button>
          <button className={activeTab === "settings" ? "navActive" : ""} onClick={() => setActiveTab("settings")} type="button">设置</button>
        </nav>
      ) : null}
    </main>
  );
}

async function handleCreateBabyFromSettings(
  authToken: string,
  familyId: string,
  babyName: string,
  babyBirthDate: string,
  setBabyName: (value: string) => void,
  setBabyBirthDate: (value: string) => void,
  setNotice: (value: string | null) => void,
  setError: (value: string | null) => void,
  refreshApp: (familyId?: string) => Promise<void>
) {
  setError(null);
  setNotice(null);
  try {
    const name = babyName.trim();
    if (!name) {
      throw new Error("请先填写宝宝姓名。")
    }
    await createBaby(authToken, familyId, {
      name,
      birthDate: babyBirthDate ? new Date(`${babyBirthDate}T00:00:00Z`).toISOString() : undefined
    });
    setBabyName("");
    setBabyBirthDate("");
    setNotice("已新增宝宝档案。")
    await refreshApp(familyId);
  } catch (err) {
    setError(err instanceof Error ? err.message : "新增宝宝档案失败。")
  }
}

function TimelineItem({ authToken, familyId, item }: { authToken: string; familyId: string; item: MediaAsset }) {
  const previewUrl = getPreviewUrl(item.id, familyId, authToken);
  const dimensions = item.width > 0 && item.height > 0 ? `${item.width} x ${item.height}` : "尺寸待生成";
  return (
    <div className="timelineItem">
      <div className="thumb">
        {item.previewStatus === "ready" ? <img alt={item.fileName} className="thumbImage" loading="lazy" src={previewUrl} /> : <div className="thumbFallback">{item.mediaType.startsWith("video") ? "视频" : "照片"}</div>}
      </div>
      <div className="timelineCopy">
        <strong>{item.fileName}</strong>
        <p>{formatDateTime(item.capturedAt)}</p>
        <p className="helperText">{sourceLabel(item.source)} / {previewLabel(item.previewStatus)} / {dimensions}</p>
      </div>
    </div>
  );
}

function MemberRow({ canEdit, draftRole, member, onChange, onSave }: { canEdit: boolean; draftRole: Role; member: FamilyMember; onChange: (role: Role) => void; onSave: () => void }) {
  return (
    <div className="memberRow">
      <div>
        <strong>{member.displayName}</strong>
        <p className="helperText">{roleLabel(member.role)}</p>
      </div>
      {canEdit ? (
        <div className="memberActions">
          <select value={draftRole} onChange={(event) => onChange(event.target.value as Role)}>
            <option value="viewer">仅查看</option>
            <option value="member">可上传</option>
            <option value="admin">管理员</option>
          </select>
          <button onClick={onSave} type="button">保存</button>
        </div>
      ) : (
        <span className="pill">{roleLabel(member.role)}</span>
      )}
    </div>
  );
}

function InviteCard({ invite, mode, origin }: { invite: FamilyInvite; mode: "preview" | "accept" | "manage"; origin: string }) {
  const inviteLink = origin ? `${origin}/?invite=${invite.code}` : `/?invite=${invite.code}`;
  return (
    <div className="inviteCard">
      <strong>{invite.familyName ?? "宝宝相册邀请"}</strong>
      <p className="helperText">权限：{roleLabel(invite.role)} / 状态：{inviteStatusLabel(invite.status)}</p>
      <p className="helperText">创建人：{invite.createdByName ?? invite.createdBy}</p>
      {mode !== "preview" ? <p className="inviteLink">{inviteLink}</p> : null}
      {mode === "preview" ? <p className="helperText">登录后即可用这个邀请码加入对应的宝宝相册。</p> : null}
    </div>
  );
}

function groupTimeline(items: MediaAsset[]) {
  const groups = new Map<string, MediaAsset[]>();
  for (const item of items) {
    const existing = groups.get(item.timelineDay) ?? [];
    existing.push(item);
    groups.set(item.timelineDay, existing);
  }
  return Array.from(groups.entries());
}

function roleLabel(role: Role) {
  switch (role) {
    case "owner":
      return "所有者";
    case "admin":
      return "管理员";
    case "member":
      return "成员";
    default:
      return "仅查看";
  }
}

function inviteStatusLabel(status: FamilyInvite["status"]) {
  switch (status) {
    case "accepted":
      return "已接受";
    case "revoked":
      return "已撤销";
    default:
      return "待接受";
  }
}

function previewLabel(status: MediaAsset["previewStatus"]) {
  switch (status) {
    case "ready":
      return "预览已生成";
    case "pending":
      return "预览生成中";
    default:
      return "无预览";
  }
}

function sourceLabel(source: string) {
  switch (source) {
    case "camera_roll":
      return "相机胶卷";
    case "manual_upload":
      return "手动上传";
    default:
      return source;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { dateStyle: "medium" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

export function AppShell() {
  return (
    <Suspense fallback={<main className="appShell"><section className="panel"><p className="helperText">正在加载宝宝相册...</p></section></main>}>
      <AppShellInner />
    </Suspense>
  );
}