"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UploadDraftSheet } from "./upload-draft-sheet";
import { acceptInvite, createAlbum, createInvite, createStorageNodePairing, getBabyAvatarUrl, getOriginalUrl, getPreviewUrl, leaveAlbum, loadAppState, loadInvite, loginUser, logoutUser, registerUser, updateBabyProfile, updateMemberRole, uploadBabyAvatar } from "../lib/api";
import type { AlbumInvite, AlbumMember, AppStatePayload, MediaAsset, Role, StorageNodePairing, TimelineEntry } from "../lib/types";

type TabKey = "photos" | "settings";
type AuthMode = "login" | "register";
type SettingsScreen = "menu" | "account" | "babies" | "addBaby" | "babyDetail" | "memberDetail" | "storage";

const TOKEN_STORAGE_KEY = "baby-album.authToken";
const ALBUM_STORAGE_KEY = "baby-album.albumId";

function AppShellInner() {
  const searchParams = useSearchParams();
  const queryInviteCode = searchParams.get("invite") ?? "";
  const [origin, setOrigin] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [activeTab, setActiveTab] = useState<TabKey>("photos");
  const [authToken, setAuthToken] = useState("");
  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  const [appState, setAppState] = useState<AppStatePayload | null>(null);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [invite, setInvite] = useState<AlbumInvite | null>(null);
  const [storagePairing, setStoragePairing] = useState<StorageNodePairing | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({});
  const [ownerTransferTarget, setOwnerTransferTarget] = useState("");
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [draftSheetOpen, setDraftSheetOpen] = useState(false);
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>("menu");
  const [settingsMemberId, setSettingsMemberId] = useState("");
  const [babyProfileName, setBabyProfileName] = useState("");
  const [babyProfileBirthDate, setBabyProfileBirthDate] = useState("");
  const [createBabyAvatarFile, setCreateBabyAvatarFile] = useState<File | null>(null);
  const [babyAvatarFile, setBabyAvatarFile] = useState<File | null>(null);
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
    setSelectedAlbumId(window.localStorage.getItem(ALBUM_STORAGE_KEY) ?? "");
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
    void refreshApp(selectedAlbumId || undefined);
  }, [hydrated, authToken, selectedAlbumId]);

  useEffect(() => {
    const members = appState?.activeAlbum?.members ?? [];
    const drafts: Record<string, Role> = {};
    for (const member of members) {
      drafts[member.userId] = member.role;
    }
    setRoleDrafts(drafts);
    if (!appState?.activeAlbum) {
      setActiveTab("photos");
    }
    setBabyProfileName(appState?.activeAlbum?.baby?.name ?? "");
    setBabyProfileBirthDate(appState?.activeAlbum?.baby?.birthDate ? toDateInputValue(appState.activeAlbum.baby.birthDate) : "");
    setBabyAvatarFile(null);
    setStoragePairing(null);
  }, [appState]);

  useEffect(() => {
    if (activeTab !== "settings") {
      setSettingsScreen("menu");
      setSettingsMemberId("");
    }
  }, [activeTab]);

  useEffect(() => {
    if (!lightbox) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightbox]);

  useEffect(() => {
    if (!lightbox) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLightbox(null);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setLightbox((current) => current ? moveLightbox(current, -1) : current);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setLightbox((current) => current ? moveLightbox(current, 1) : current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  async function refreshApp(targetAlbumId?: string) {
    if (!authToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loadAppState(authToken, targetAlbumId);
      setAppState(next);
      const albumId = next.activeAlbumId ?? "";
      setSelectedAlbumId(albumId);
      if (albumId) {
        window.localStorage.setItem(ALBUM_STORAGE_KEY, albumId);
      } else {
        window.localStorage.removeItem(ALBUM_STORAGE_KEY);
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
    window.localStorage.removeItem(ALBUM_STORAGE_KEY);
    setAuthToken("");
    setSelectedAlbumId("");
    setAppState(null);
    setActiveTab("photos");
    if (showNotice) {
      setNotice("已退出登录。");
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
      setError(err instanceof Error ? err.message : "注册失败。");
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
      setError(err instanceof Error ? err.message : "登录失败。");
    }
  }

  async function handleLogout() {
    try {
      if (authToken) {
        await logoutUser(authToken);
      }
    } catch {
      // Keep local logout deterministic even if the API call fails.
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
        throw new Error("请先填写宝宝姓名。");
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
      const album = await createAlbum(authToken, {
        name: `${name}的宝宝相册`,
        timezone,
        babyName: name,
        birthDate: babyBirthDate ? new Date(`${babyBirthDate}T00:00:00Z`).toISOString() : undefined
      });
      if (createBabyAvatarFile) {
        const next = await loadAppState(authToken, album.id);
        const createdBaby = next.activeAlbum?.baby;
        if (createdBaby) {
          await uploadBabyAvatar(authToken, album.id, createdBaby.id, createBabyAvatarFile);
        }
      }
      setBabyName("");
      setBabyBirthDate("");
      setCreateBabyAvatarFile(null);
      setSelectedAlbumId(album.id);
      window.localStorage.setItem(ALBUM_STORAGE_KEY, album.id);
      setNotice("宝宝相册已创建。");
      await refreshApp(album.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建宝宝相册失败。");
    }
  }

  async function handleAcceptInvite(code?: string) {
    if (!authToken) {
      return;
    }
    const inviteCode = (code ?? inviteCodeInput).trim();
    if (!inviteCode) {
      setError("请输入邀请码。");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const accepted = await acceptInvite(authToken, inviteCode);
      setSelectedAlbumId(accepted.albumId);
      window.localStorage.setItem(ALBUM_STORAGE_KEY, accepted.albumId);
      setNotice(`已加入 ${accepted.albumName ?? "宝宝相册"}。`);
      await refreshApp(accepted.albumId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入相册失败。");
    }
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken || !appState?.activeAlbum) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const created = await createInvite(authToken, appState.activeAlbum.album.id, inviteRole);
      setNotice(`已生成邀请码：${created.code}`);
      await refreshApp(appState.activeAlbum.album.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建邀请码失败。");
    }
  }

  async function handleCreateStoragePairing() {
    if (!authToken || !appState?.activeAlbum) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const pairing = await createStorageNodePairing(authToken, appState.activeAlbum.album.id);
      setStoragePairing(pairing);
      setNotice("已生成储存节点配对码。请在 24 小时内用于首次部署 agent。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成储存节点配对码失败。");
    }
  }

  async function handleOpenAlbumSettings(albumId: string) {
    setError(null);
    setNotice(null);
    await refreshApp(albumId);
    setSettingsScreen("babyDetail");
  }

  async function handleUpdateBabyProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken || !activeAlbum?.baby) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await updateBabyProfile(authToken, activeAlbum.album.id, activeAlbum.baby.id, {
        name: babyProfileName.trim(),
        birthDate: babyProfileBirthDate ? new Date(`${babyProfileBirthDate}T00:00:00Z`).toISOString() : undefined
      });
      if (babyAvatarFile) {
        await uploadBabyAvatar(authToken, activeAlbum.album.id, activeAlbum.baby.id, babyAvatarFile);
        setBabyAvatarFile(null);
      }
      setNotice("宝宝信息已更新。");
      await refreshApp(activeAlbum.album.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新宝宝信息失败。");
    }
  }

  async function handleRoleUpdate(memberUserId: string) {
    if (!authToken || !appState?.activeAlbum) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const nextRole = roleDrafts[memberUserId];
      await updateMemberRole(authToken, appState.activeAlbum.album.id, memberUserId, nextRole);
      setNotice(`已更新成员权限：${roleLabel(nextRole)}。`);
      await refreshApp(appState.activeAlbum.album.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新成员权限失败。");
    }
  }

  async function handleLeaveAlbum() {
    if (!authToken || !appState?.activeAlbum) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await leaveAlbum(authToken, appState.activeAlbum.album.id, ownerTransferTarget || undefined);
      setOwnerTransferTarget("");
      setNotice("你已退出当前宝宝相册。");
      await refreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出相册失败。");
    }
  }

  function handleOpenUploadFlow() {
    if (!activeAlbum) {
      return;
    }
    if (!storageNode) {
      setNotice("请先去设置里配对储存节点。");
      setActiveTab("settings");
      setSettingsScreen("storage");
      return;
    }
    if (activeAlbum.membership.role === "viewer") {
      setNotice("当前身份没有上传权限。");
      return;
    }
    setDraftSheetOpen(true);
  }

  function refreshTimelineSoon(targetAlbumId: string) {
    void refreshApp(targetAlbumId);
    window.setTimeout(() => void refreshApp(targetAlbumId), 2000);
    window.setTimeout(() => void refreshApp(targetAlbumId), 5000);
  }

  const activeAlbum = appState?.activeAlbum ?? null;
  const albumOptions = appState?.albums ?? [];
  const currentUser = appState?.currentUser ?? null;
  const activeBaby = activeAlbum?.baby ?? activeAlbum?.babies?.[0] ?? null;
  const albumTimeline = activeAlbum?.timeline ?? [];
  const albumMembers = activeAlbum?.members ?? [];
  const albumInvites = activeAlbum?.invites ?? [];
  const storageNode = activeAlbum?.storageNode ?? null;
  const canManageInvites = activeAlbum?.membership.role === "owner" || activeAlbum?.membership.role === "admin";
  const canManageBabyProfile = activeAlbum?.membership.role === "owner" || activeAlbum?.membership.role === "admin";
  const canManageStorage = activeAlbum?.membership.role === "owner";
  const timelineDays = useMemo(() => buildTimelineFeed(albumTimeline, activeBaby?.birthDate), [albumTimeline, activeBaby?.birthDate]);
  const canUploadMedia = Boolean(activeAlbum && activeAlbum.membership.role !== "viewer" && storageNode);
  const transferCandidates = albumMembers.filter((member) => member.userId !== currentUser?.id);

  return (
    <main className="appShell">
      {!authToken || !activeAlbum ? <section className="topBar panel">
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
      </section> : null}

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
              <span className="tag">成员权限管理</span>
            </div>
          </article>

          <section className="gridColumns">
            <article className="panelStack panel">
              <div className="sectionHeading">
                <div>
                  <p className="eyebrow">账号</p>
                  <h2>{authMode === "login" ? "登录" : "注册"}</h2>
                </div>
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
                  <button className="secondaryButton" onClick={() => setAuthMode("login")} type="button">返回登录</button>
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
                  <button className="secondaryButton" onClick={() => setAuthMode("register")} type="button">注册</button>
                </form>
              )}
            </article>
          </section>
        </section>
      ) : null}

      {authToken && !activeAlbum && !loading ? (
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
              <label>
                宝宝头像
                <input accept="image/*" onChange={(event) => setCreateBabyAvatarFile(event.target.files?.[0] ?? null)} type="file" />
              </label>
              <button type="submit">创建宝宝相册</button>
            </form>
            <p className="helperText">系统会自动为这个宝宝创建一个相册空间，并将你设为所有者。</p>
          </article>
        </section>
      ) : null}

      {authToken && activeAlbum ? (
        <>
          {activeTab === "photos" ? (
            <section className="pageStack">
              <article className="momentsHero panel">
                <div className="momentsHeroBackdrop" />
                <div className="momentsHeroBody">
                  <BabyAvatar albumId={activeAlbum.album.id} baby={activeBaby} className="momentsHeroAvatar" token={authToken} />
                  <div className="momentsHeroCopy">
                    <h2>{activeBaby?.name ?? activeAlbum.album.name}</h2>
                    <p className="momentsHeroMeta">{activeBaby?.birthDate ? `出生 ${formatDate(activeBaby.birthDate)}` : "还没有填写出生日期"}</p>
                  </div>
                  <div className="momentsHeroAside">
                    <p className="momentsHeroMeta">{albumTimeline.length} 条内容</p>
                    <select className="heroAlbumSelect" value={activeAlbum.album.id} onChange={(event) => void refreshApp(event.target.value)}>
                      {albumOptions.map((item) => (
                        <option key={item.album.id} value={item.album.id}>
                          {item.baby?.name ?? item.album.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </article>

              <div className="momentsFeed">
                {timelineDays.length === 0 ? <article className="panel panelStack"><p className="helperText">还没有媒体内容，先去上传一张照片吧。</p></article> : timelineDays.map((day) => (
                  <article className="momentDay" key={day.day}>
                    <header className="momentDayHeader">
                      <div>
                        <h3>{formatTimelineDate(day.day)}</h3>
                        <p>{day.itemsCount} 项</p>
                      </div>
                      {day.babyAgeLabel ? <span className="momentBabyDay">宝宝第 {day.babyAgeLabel}</span> : null}
                    </header>
                    <div className="momentBatchList">
                      {day.batches.map((batch) => <MomentCard albumId={activeAlbum.album.id} authToken={authToken} batch={batch} key={`${day.day}-${batch.batchId}`} onOpen={(index) => setLightbox({ albumId: activeAlbum.album.id, batch, index })} />)}
                    </div>
                  </article>
                ))}
              </div>
              <button className="floatingAddButton" onClick={handleOpenUploadFlow} type="button">+</button>
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className="pageStack settingsPage">
              {settingsScreen === "menu" ? (
                <article className="settingsMenu">
                  <button className="settingsMenuItem panel" onClick={() => setSettingsScreen("account")} type="button"><span>账户管理</span><span>›</span></button>
                  <button className="settingsMenuItem panel" onClick={() => setSettingsScreen("babies")} type="button"><span>宝宝管理</span><span>›</span></button>
                  <button className="settingsMenuItem panel" disabled={!canManageStorage} onClick={() => setSettingsScreen("storage")} type="button"><span>储存节点管理</span><span>{canManageStorage ? "›" : "仅 owner"}</span></button>
                  <button className="settingsMenuItem settingsMenuDanger panel" onClick={handleLogout} type="button"><span>退出登录</span><span>›</span></button>
                </article>
              ) : null}

              {settingsScreen === "account" ? (
                <article className="panelStack settingsDetailPage">
                  <div className="sectionHeading"><button className="secondaryButton" onClick={() => setSettingsScreen("menu")} type="button">返回</button><div><p className="eyebrow">账户管理</p><h2>当前登录</h2></div></div>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">当前登录</p>
                    <p><strong>{currentUser?.displayName}</strong></p>
                    <p className="helperText">{currentUser?.email}</p>
                    <p className="helperText">当前在 {activeBaby?.name ?? activeAlbum.album.name} 中的角色：{roleLabel(activeAlbum.membership.role)}</p>
                  </article>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">退出登录</p>
                    <button className="secondaryButton" onClick={handleLogout} type="button">退出登录</button>
                  </article>
                </article>
              ) : null}

              {settingsScreen === "babies" ? (
                <article className="panelStack settingsDetailPage">
                  <div className="sectionHeading">
                    <button className="secondaryButton" onClick={() => setSettingsScreen("menu")} type="button">返回</button>
                    <div><p className="eyebrow">宝宝管理</p><h2>已加入的宝宝</h2></div>
                    <button onClick={() => setSettingsScreen("addBaby")} type="button">添加宝宝</button>
                  </div>
                  <div className="stackList">
                    {albumOptions.map((item) => (
                      <button
                        className="settingsCardButton panel"
                        key={item.album.id}
                        onClick={() => void handleOpenAlbumSettings(item.album.id)}
                        type="button"
                      >
                        <BabyAvatar albumId={item.album.id} baby={item.baby ?? null} className="settingsCardAvatar" token={authToken} />
                        <span className="settingsCardBody">
                          <span className="settingsMenuPrimary">{item.baby?.name ?? item.album.name}</span>
                          <span className="settingsMenuMeta">{roleLabel(item.membership.role)}</span>
                        </span>
                        <span className="settingsMenuMeta">›</span>
                      </button>
                    ))}
                  </div>
                </article>
              ) : null}

              {settingsScreen === "addBaby" ? (
                <article className="panelStack settingsDetailPage">
                  <div className="sectionHeading">
                    <button className="secondaryButton" onClick={() => setSettingsScreen("babies")} type="button">返回</button>
                    <div><p className="eyebrow">添加宝宝</p><h2>新建或加入</h2></div>
                  </div>
                  <form className="panelStack panel" onSubmit={handleCreateAlbum}>
                    <p className="settingsCardTitle">自己新建</p>
                    <label>宝宝姓名<input value={babyName} onChange={(event) => setBabyName(event.target.value)} /></label>
                    <label>出生日期<input type="date" value={babyBirthDate} onChange={(event) => setBabyBirthDate(event.target.value)} /></label>
                    <label>宝宝头像<input accept="image/*" onChange={(event) => setCreateBabyAvatarFile(event.target.files?.[0] ?? null)} type="file" /></label>
                    <button type="submit">创建宝宝</button>
                  </form>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">邀请码加入</p>
                    <label>邀请码<input value={inviteCodeInput} onChange={(event) => setInviteCodeInput(event.target.value)} /></label>
                    <button onClick={() => void handleAcceptInvite()} type="button">加入宝宝</button>
                  </article>
                </article>
              ) : null}

              {settingsScreen === "babyDetail" ? (
                <article className="panelStack settingsDetailPage">
                  <div className="sectionHeading"><button className="secondaryButton" onClick={() => setSettingsScreen("babies")} type="button">返回</button><div><p className="eyebrow">宝宝管理</p><h2>{activeBaby?.name ?? activeAlbum.album.name}</h2></div></div>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">我的角色</p>
                    <p className="helperText">你在这个宝宝家庭中的角色：{roleLabel(activeAlbum.membership.role)}</p>
                  </article>
                  {activeBaby ? (
                    <form className="formGrid panelStack panel" onSubmit={handleUpdateBabyProfile}>
                      <p className="settingsCardTitle">修改宝宝信息</p>
                      <div className="babyProfileAvatarRow">
                        <BabyAvatar albumId={activeAlbum.album.id} baby={activeBaby} className="settingsCardAvatar settingsCardAvatarLarge" previewFile={babyAvatarFile} token={authToken} />
                        <label className="avatarUploadField">
                          更换头像
                          <input accept="image/*" disabled={!canManageBabyProfile} onChange={(event) => setBabyAvatarFile(event.target.files?.[0] ?? null)} type="file" />
                        </label>
                      </div>
                      <label>宝宝姓名<input disabled={!canManageBabyProfile} value={babyProfileName} onChange={(event) => setBabyProfileName(event.target.value)} /></label>
                      <label>出生日期<input disabled={!canManageBabyProfile} type="date" value={babyProfileBirthDate} onChange={(event) => setBabyProfileBirthDate(event.target.value)} /></label>
                      {canManageBabyProfile ? <button type="submit">保存宝宝信息</button> : <p className="helperText">只有管理员或 owner 可以修改宝宝信息。</p>}
                    </form>
                  ) : null}
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">管理亲友</p>
                    <div className="stackList">
                      {albumMembers.map((member) => (
                        <button className="settingsCardButton settingsMemberCard" key={member.userId} onClick={() => { setSettingsMemberId(member.userId); setSettingsScreen("memberDetail"); }} type="button">
                          <span className="settingsCardAvatar" aria-hidden="true">{babyAvatarText(member.displayName)}</span>
                          <span className="settingsCardBody">
                            <span className="settingsMenuPrimary">{member.displayName}</span>
                            <span className="settingsMenuMeta">{roleLabel(member.role)}</span>
                          </span>
                          <span className="settingsMenuMeta">›</span>
                        </button>
                      ))}
                    </div>
                  </article>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">邀请码</p>
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
                          {albumInvites.map((item) => <InviteCard invite={item} key={item.id} mode="code" origin={origin} />)}
                        </div>
                      </>
                    ) : <p className="helperText">只有管理员或 owner 可以生成邀请码。</p>}
                  </article>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">删除宝宝</p>
                    {activeAlbum.membership.role === "owner" ? (
                      transferCandidates.length > 0 ? (
                        <>
                          <label>
                            选择新的 owner
                            <select value={ownerTransferTarget} onChange={(event) => setOwnerTransferTarget(event.target.value)}>
                              <option value="">请选择成员</option>
                              {transferCandidates.map((member) => <option key={member.userId} value={member.userId}>{member.displayName} / {roleLabel(member.role)}</option>)}
                            </select>
                          </label>
                          <button onClick={() => void handleLeaveAlbum()} type="button">转让并退出</button>
                        </>
                      ) : <p className="helperText">当前没有其他成员，owner 暂时不能退出。</p>
                    ) : <button className="secondaryButton" onClick={() => void handleLeaveAlbum()} type="button">退出当前宝宝</button>}
                  </article>
                </article>
              ) : null}

              {settingsScreen === "memberDetail" ? (
                <article className="panelStack settingsDetailPage">
                  <div className="sectionHeading"><button className="secondaryButton" onClick={() => setSettingsScreen("babyDetail")} type="button">返回</button><div><p className="eyebrow">成员详情</p><h2>{albumMembers.find((member) => member.userId === settingsMemberId)?.displayName ?? "成员"}</h2></div></div>
                  {albumMembers.filter((member) => member.userId === settingsMemberId).map((member) => (
                    <article className="panelStack panel" key={member.userId}>
                      <p className="settingsCardTitle">成员信息</p>
                      <p><strong>{member.displayName}</strong></p>
                      <p className="helperText">用户 ID：{member.userId}</p>
                      <p className="helperText">当前权限：{roleLabel(member.role)}</p>
                      {Boolean(activeAlbum.membership.role === "owner" && currentUser && member.userId !== currentUser.id && member.role !== "owner") ? (
                        <div className="memberActions">
                          <select value={roleDrafts[member.userId] ?? member.role} onChange={(event) => setRoleDrafts((current) => ({ ...current, [member.userId]: event.target.value as Role }))}>
                            <option value="viewer">仅查看</option>
                            <option value="member">可上传</option>
                            <option value="admin">管理员</option>
                          </select>
                          <button onClick={() => void handleRoleUpdate(member.userId)} type="button">保存权限</button>
                        </div>
                      ) : <p className="helperText">只有 owner 可以修改其他亲友权限。</p>}
                    </article>
                  ))}
                </article>
              ) : null}

              {settingsScreen === "storage" ? (
                <article className="panelStack settingsDetailPage">
                  <div className="sectionHeading"><button className="secondaryButton" onClick={() => setSettingsScreen("menu")} type="button">返回</button><div><p className="eyebrow">储存节点管理</p><h2>{activeBaby?.name ?? activeAlbum.album.name}</h2></div></div>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">当前宝宝</p>
                    <label>
                      <select value={activeAlbum.album.id} onChange={(event) => void refreshApp(event.target.value)}>
                        {albumOptions.map((item) => (
                          <option key={item.album.id} value={item.album.id}>{item.baby?.name ?? item.album.name}</option>
                        ))}
                      </select>
                    </label>
                  </article>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">储存节点</p>
                    {storageNode ? (
                      <>
                        <p><strong>{storageNode.name}</strong></p>
                        <p className="helperText">状态：{storageNode.status === "online" ? "在线" : "离线"} / 最近心跳：{formatDateTime(storageNode.lastSeenAt)}</p>
                        <p className="helperText">可用空间：{formatBytes(storageNode.availableBytes)} / 总容量：{formatBytes(storageNode.totalBytes)}</p>
                      </>
                    ) : <p className="helperText">这个宝宝还没有绑定储存节点。</p>}
                  </article>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">配对码</p>
                    {canManageStorage ? <button onClick={() => void handleCreateStoragePairing()} type="button">生成配对码</button> : <p className="helperText">只有 owner 可以管理储存节点。</p>}
                    {storagePairing ? <p className="inviteLink">{storagePairing.code}</p> : null}
                    {storagePairing ? <p className="helperText">配对码为 8 位短码，仅 owner 可生成。</p> : null}
                  </article>
                </article>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {loading ? <p className="helperText loadingRow">正在同步最新状态...</p> : null}

      {lightbox ? <LightboxViewer authToken={authToken} lightbox={lightbox} onClose={() => setLightbox(null)} onNavigate={(direction) => setLightbox((current) => current ? moveLightbox(current, direction) : current)} /> : null}
      {authToken && activeAlbum ? <UploadDraftSheet albumId={activeAlbum.album.id} authToken={authToken} babyName={activeBaby?.name} disabled={!canUploadMedia} disabledReason={!storageNode ? "上传前需要先完成 NAS 配对。" : "当前身份没有上传权限。"} onClose={() => setDraftSheetOpen(false)} onUploaded={() => refreshTimelineSoon(activeAlbum.album.id)} open={draftSheetOpen} /> : null}

      {authToken && activeAlbum && !draftSheetOpen ? (
        <nav className="bottomNav">
          <button className={activeTab === "photos" ? "navActive" : ""} onClick={() => setActiveTab("photos")} type="button">照片</button>
          <button className={activeTab === "settings" ? "navActive" : ""} onClick={() => setActiveTab("settings")} type="button">设置</button>
        </nav>
      ) : null}
    </main>
  );
}

type TimelineBatch = {
  batchId: string;
  uploadedAt: string;
  uploadedByName: string;
  caption: string;
  visibility: TimelineEntry["visibility"];
  items: MediaAsset[];
};

type TimelineDayGroup = {
  day: string;
  babyAgeLabel: string;
  itemsCount: number;
  batches: TimelineBatch[];
};

type LightboxState = {
  albumId: string;
  batch: TimelineBatch;
  index: number;
};

function BabyAvatar({ baby, albumId, token, className, previewFile }: { baby?: { id: string; name: string; hasAvatar?: boolean; avatarUpdatedAt?: string; createdAt?: string } | null; albumId: string; token: string; className: string; previewFile?: File | null }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(previewFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [previewFile]);

  const avatarVersion = baby?.avatarUpdatedAt ?? baby?.createdAt;
  const avatarUrl = previewUrl || (baby?.hasAvatar ? getBabyAvatarUrl(baby.id, albumId, token, avatarVersion) : "");
  if (avatarUrl) {
    return <img alt={baby?.name ?? "宝宝头像"} className={className} src={avatarUrl} />;
  }
  return <div aria-hidden="true" className={className}>{babyAvatarText(baby?.name)}</div>;
}

function MomentCard({ authToken, albumId, batch, onOpen }: { authToken: string; albumId: string; batch: TimelineBatch; onOpen: (index: number) => void }) {
  const isVideoBatch = batch.items.length === 1 && batch.items[0].mediaType.startsWith("video/");
  return (
    <article className="momentCard">
      {isVideoBatch ? (
        <MomentVideo authToken={authToken} albumId={albumId} item={batch.items[0]} onOpen={() => onOpen(0)} />
      ) : (
        <div className={`momentPhotoGrid momentPhotoGrid${Math.min(batch.items.length, 9)}`}>
          {batch.items.map((item, index) => <MomentThumb albumId={albumId} authToken={authToken} item={item} key={item.id} onOpen={() => onOpen(index)} />)}
        </div>
      )}
      {batch.caption ? <p className="momentCaption">{batch.caption}</p> : null}
      <p className="momentMeta">{batch.uploadedByName || "家人"} 上传于 {formatRelativeUploadTime(batch.uploadedAt)}</p>
      {batch.visibility === "managers" ? <p className="momentMeta">仅管理员和所有者可见</p> : null}
    </article>
  );
}

function MomentVideo({ authToken, albumId, item, onOpen }: { authToken: string; albumId: string; item: MediaAsset; onOpen: () => void }) {
  return (
    <div className="momentVideo">
      <MomentThumb albumId={albumId} authToken={authToken} item={item} large onOpen={onOpen} />
      <div className="momentVideoBadge">视频</div>
    </div>
  );
}

function MomentThumb({ authToken, albumId, item, large, onOpen }: { authToken: string; albumId: string; item: MediaAsset; large?: boolean; onOpen?: () => void }) {
  const previewUrl = getPreviewUrl(item.id, albumId, authToken, item.processedAt ?? item.uploadedAt);
  return (
    <button className={`momentThumb${large ? " momentThumbLarge" : ""}`} onClick={onOpen} type="button">
      {item.previewStatus === "ready" ? (
        <img alt={item.fileName} className="momentThumbImage" loading="lazy" src={previewUrl} />
      ) : (
        <div className="momentThumbFallback">{item.mediaType.startsWith("video") ? "视频" : "照片"}</div>
      )}
    </button>
  );
}

function LightboxViewer({ authToken, lightbox, onClose, onNavigate }: { authToken: string; lightbox: LightboxState; onClose: () => void; onNavigate: (direction: -1 | 1) => void }) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const currentItem = lightbox.batch.items[lightbox.index];
  const originalUrl = getOriginalUrl(currentItem.id, lightbox.albumId, authToken);
  const previewUrl = getPreviewUrl(currentItem.id, lightbox.albumId, authToken, currentItem.processedAt ?? currentItem.uploadedAt);
  const hasMultiple = lightbox.batch.items.length > 1;
  const [displayUrl, setDisplayUrl] = useState(originalUrl);

  useEffect(() => {
    setDisplayUrl(originalUrl);
  }, [originalUrl]);

  return (
    <div className="lightboxOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lightboxShell" onClick={(event) => event.stopPropagation()}>
        <div className="lightboxTopBar">
          <div>
            <strong>{currentItem.fileName}</strong>
            <p>{lightbox.batch.uploadedByName || "家人"} · {formatRelativeUploadTime(lightbox.batch.uploadedAt)}</p>
          </div>
          <button className="lightboxClose" onClick={onClose} type="button">关闭</button>
        </div>

        <div
          className="lightboxStage"
          onTouchEnd={(event) => {
            if (touchStartX === null) {
              return;
            }
            const delta = event.changedTouches[0].clientX - touchStartX;
            setTouchStartX(null);
            if (Math.abs(delta) < 36 || !hasMultiple) {
              return;
            }
            onNavigate(delta > 0 ? -1 : 1);
          }}
          onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
        >
          {hasMultiple ? <button className="lightboxArrow lightboxArrowLeft" onClick={() => onNavigate(-1)} type="button">‹</button> : null}
          {currentItem.previewStatus === "ready" ? (
            <img alt={currentItem.fileName} className="lightboxImage" onError={() => setDisplayUrl(previewUrl)} src={displayUrl} />
          ) : (
            <div className="lightboxFallback">{currentItem.mediaType.startsWith("video") ? "视频预览待生成" : "照片预览待生成"}</div>
          )}
          {hasMultiple ? <button className="lightboxArrow lightboxArrowRight" onClick={() => onNavigate(1)} type="button">›</button> : null}
        </div>

        <div className="lightboxBottomBar">
          <p>{formatDateTime(currentItem.capturedAt)}</p>
          <span>{lightbox.index + 1} / {lightbox.batch.items.length}</span>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ canEdit, draftRole, member, onChange, onSave }: { canEdit: boolean; draftRole: Role; member: AlbumMember; onChange: (role: Role) => void; onSave: () => void }) {
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

function InviteCard({ invite, mode, origin }: { invite: AlbumInvite; mode: "preview" | "accept" | "code"; origin: string }) {
  const inviteLink = origin ? `${origin}/?invite=${invite.code}` : `/?invite=${invite.code}`;
  return (
    <div className="inviteCard">
      <strong>{invite.albumName ?? "宝宝相册邀请"}</strong>
      <p className="helperText">权限：{roleLabel(invite.role)} / 状态：{inviteStatusLabel(invite.status)}</p>
      <p className="helperText">创建人：{invite.createdByName ?? invite.createdBy}</p>
      {mode === "accept" ? <p className="inviteLink">{inviteLink}</p> : null}
      {mode === "code" ? <p className="inviteLink">{invite.code}</p> : null}
      {mode === "preview" ? <p className="helperText">登录后即可用这个邀请码加入对应的宝宝相册。</p> : null}
    </div>
  );
}

function buildTimelineFeed(items: TimelineEntry[], birthDate?: string) {
  const days = new Map<string, TimelineBatch[]>();
  for (const entry of items) {
    if (!entry.items || entry.items.length === 0) {
      continue;
    }
    const day = days.get(entry.timelineDay) ?? [];
    day.push({
      batchId: entry.id,
      uploadedAt: entry.uploadedAt,
      uploadedByName: entry.uploadedByName,
      caption: entry.caption,
      visibility: entry.visibility,
      items: [...entry.items].sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime())
    });
    days.set(entry.timelineDay, day);
  }

  return Array.from(days.entries())
    .sort((left, right) => new Date(right[0]).getTime() - new Date(left[0]).getTime())
    .map(([day, batches]) => ({
      day,
      babyAgeLabel: birthDate ? formatBabyAge(birthDate, day) : "",
      itemsCount: batches.reduce((sum, batch) => sum + batch.items.length, 0),
      batches: batches.sort((left, right) => new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime())
    } satisfies TimelineDayGroup));
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

function inviteStatusLabel(status: AlbumInvite["status"]) {
  switch (status) {
    case "accepted":
      return "已接受";
    case "revoked":
      return "已撤销";
    default:
      return "待接受";
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { dateStyle: "medium" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function babyAvatarText(name?: string | null) {
  if (!name) {
    return "宝";
  }
  return name.slice(0, 1);
}

function formatTimelineDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const now = new Date();
  return date.toLocaleDateString("zh-CN", {
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  });
}

function formatBabyAge(birthDate: string, targetDate = new Date().toISOString()) {
  const start = startOfDay(new Date(birthDate));
  const end = startOfDay(new Date(targetDate));
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "1天";
  }
  const totalDays = Math.floor(diffMs / 86400000) + 1;
  if (totalDays < 30) {
    return `${totalDays}天`;
  }
  if (totalDays < 365) {
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    return days > 0 ? `${months}个月${days}天` : `${months}个月`;
  }
  const years = Math.floor(totalDays / 365);
  const remainingDays = totalDays % 365;
  const months = Math.floor(remainingDays / 30);
  return months > 0 ? `${years}岁${months}个月` : `${years}岁`;
}

function formatRelativeUploadTime(value: string) {
  const time = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - time.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)}分钟前`;
  }
  if (isSameDay(time, now)) {
    return `${Math.floor(diffMinutes / 60)}小时前`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(time, yesterday)) {
    return `昨天 ${time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  return `${time.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" })} ${time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function toDateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function moveLightbox(current: LightboxState, direction: -1 | 1) {
  const nextIndex = (current.index + direction + current.batch.items.length) % current.batch.items.length;
  return { ...current, index: nextIndex };
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function AppShell() {
  return (
    <Suspense fallback={<main className="appShell"><section className="panel"><p className="helperText">正在加载宝宝相册...</p></section></main>}>
      <AppShellInner />
    </Suspense>
  );
}
