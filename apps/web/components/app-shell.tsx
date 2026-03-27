"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UploadDraftSheet } from "./upload-draft-sheet";
import { acceptInvite, createAlbum, createInvite, createStorageNodePairing, getBabyAvatarUrl, getOriginalUrl, getPreviewUrl, leaveAlbum, loadAppState, loadInvite, loadTimelinePage, loginUser, logoutUser, registerUser, updateBabyProfile, updateMemberRelation, updateMemberRole, uploadBabyAvatar } from "../lib/api";
import type { AlbumInvite, AlbumMember, AppStatePayload, MediaAsset, Role, StorageNodePairing, TimelineEntry } from "../lib/types";

type TabKey = "photos" | "settings";
type AuthMode = "login" | "register";
type SettingsScreen = "menu" | "account" | "babies" | "addBaby" | "babyDetail" | "memberDetail" | "storage";
type NavDirection = "forward" | "back";

const TOKEN_STORAGE_KEY = "baby-album.authToken";
const ALBUM_STORAGE_KEY = "baby-album.albumId";
const RELATION_OPTIONS = ["爸爸", "妈妈", "爷爷", "奶奶", "外公", "外婆", "阿姨", "叔叔", "哥哥", "姐姐"];
const OVERLAY_EXIT_MS = 240;
const TIMELINE_PAGE_SIZE = 10;
const PULL_REFRESH_TRIGGER = 72;
const PULL_REFRESH_MAX = 104;

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
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>("menu");
  const [settingsNavDirection, setSettingsNavDirection] = useState<NavDirection>("forward");
  const [settingsMemberId, setSettingsMemberId] = useState("");
  const [lightboxClosing, setLightboxClosing] = useState(false);
  const tabScrollPositionsRef = useRef<Record<TabKey, number>>({ photos: 0, settings: 0 });
  const timelineRequestRef = useRef(0);
  const timelineAlbumRef = useRef("");
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [babyProfileName, setBabyProfileName] = useState("");
  const [babyProfileBirthDate, setBabyProfileBirthDate] = useState("");
  const [createBabyAvatarFile, setCreateBabyAvatarFile] = useState<File | null>(null);
  const [babyAvatarFile, setBabyAvatarFile] = useState<File | null>(null);
  const [createRelation, setCreateRelation] = useState("");
  const [inviteRelation, setInviteRelation] = useState("");
  const [myRelationDraft, setMyRelationDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineNextCursor, setTimelineNextCursor] = useState("");
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false);
  const [timelineRefreshing, setTimelineRefreshing] = useState(false);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [pullReady, setPullReady] = useState(false);

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [babyName, setBabyName] = useState("");
  const [babyBirthDate, setBabyBirthDate] = useState("");

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
    setMyRelationDraft(appState?.activeAlbum?.membership.relation ?? "");
    setBabyAvatarFile(null);
  }, [appState]);

  useEffect(() => {
    if (activeTab !== "settings") {
      setSettingsNavDirection("forward");
      setSettingsScreen("menu");
      setSettingsMemberId("");
    }
  }, [activeTab]);

  useEffect(() => {
    if (!authToken || !appState?.activeAlbum) {
      return;
    }
    function handleScroll() {
      tabScrollPositionsRef.current[activeTab] = window.scrollY;
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [appState, activeTab, authToken]);

  useLayoutEffect(() => {
    if (!authToken || !appState?.activeAlbum) {
      return;
    }
    const nextScrollTop = tabScrollPositionsRef.current[activeTab] ?? 0;
    window.scrollTo(0, nextScrollTop);
  }, [appState, activeTab, authToken]);

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
        requestCloseLightbox();
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

  useEffect(() => {
    if (!lightboxClosing) {
      return;
    }
    const timer = window.setTimeout(() => {
      setLightbox(null);
      setLightboxClosing(false);
    }, OVERLAY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [lightboxClosing]);

  useEffect(() => {
    if (draftSheetOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      setEditingEntry(null);
    }, OVERLAY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [draftSheetOpen]);

  useEffect(() => {
    if (activeTab !== "photos" || draftSheetOpen || lightbox) {
      resetPullRefresh();
    }
  }, [activeTab, draftSheetOpen, lightbox]);

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

  function mergeTimelineEntries(existing: TimelineEntry[], incoming: TimelineEntry[]) {
    const seen = new Set(existing.map((entry) => entry.id));
    const next = [...existing];
    for (const entry of incoming) {
      if (seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      next.push(entry);
    }
    return next;
  }

  async function replaceTimeline(albumId: string, limit = TIMELINE_PAGE_SIZE, showRefreshing = false) {
    if (!authToken) {
      return;
    }
    const requestId = timelineRequestRef.current + 1;
    timelineRequestRef.current = requestId;
    if (showRefreshing) {
      setTimelineRefreshing(true);
    } else {
      setTimelineLoading(true);
    }
    try {
      const page = await loadTimelinePage(authToken, albumId, { limit });
      if (timelineRequestRef.current !== requestId) {
        return;
      }
      timelineAlbumRef.current = albumId;
      setTimelineEntries(page.items);
      setTimelineNextCursor(page.nextCursor ?? "");
      setTimelineHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载时间线失败。");
    } finally {
      if (timelineRequestRef.current === requestId) {
        setTimelineLoading(false);
        setTimelineRefreshing(false);
      }
    }
  }

  async function loadMoreTimeline(albumId: string) {
    if (!authToken || !timelineHasMore || !timelineNextCursor || timelineLoadingMore || timelineLoading || timelineRefreshing) {
      return;
    }
    setTimelineLoadingMore(true);
    try {
      const page = await loadTimelinePage(authToken, albumId, { cursor: timelineNextCursor, limit: TIMELINE_PAGE_SIZE });
      if (timelineAlbumRef.current !== albumId) {
        return;
      }
      setTimelineEntries((current) => mergeTimelineEntries(current, page.items));
      setTimelineNextCursor(page.nextCursor ?? "");
      setTimelineHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载更多时间线失败。");
    } finally {
      setTimelineLoadingMore(false);
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
      const relation = createRelation.trim();
      if (!relation) {
        throw new Error("请先填写你与宝宝的关系。");
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
      const album = await createAlbum(authToken, {
        name: `${name}的宝宝相册`,
        timezone,
        babyName: name,
        birthDate: babyBirthDate ? new Date(`${babyBirthDate}T00:00:00Z`).toISOString() : undefined,
        relation
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
      setCreateRelation("");
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
      const relation = inviteRelation.trim();
      if (!relation) {
        throw new Error("请先填写你与宝宝的关系。");
      }
      const accepted = await acceptInvite(authToken, inviteCode, relation);
      setSelectedAlbumId(accepted.albumId);
      window.localStorage.setItem(ALBUM_STORAGE_KEY, accepted.albumId);
      setInviteRelation("");
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
      const created = await createInvite(authToken, appState.activeAlbum.album.id);
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
      setNotice(appState.activeAlbum.storageNode ? "已生成替换配对码。新设备接入后会切换为当前主节点。" : "已生成储存节点配对码。请在 24 小时内用于首次部署 agent。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成储存节点配对码失败。");
    }
  }

  function openSettingsScreen(screen: SettingsScreen, direction: NavDirection = "forward", options?: { memberId?: string }) {
    setSettingsNavDirection(direction);
    if (screen !== "memberDetail") {
      setSettingsMemberId("");
    }
    if (options?.memberId) {
      setSettingsMemberId(options.memberId);
    }
    setSettingsScreen(screen);
  }

  function switchTab(nextTab: TabKey) {
    tabScrollPositionsRef.current[activeTab] = window.scrollY;
    setActiveTab(nextTab);
  }

  async function handleOpenAlbumSettings(albumId: string) {
    setError(null);
    setNotice(null);
    await refreshApp(albumId);
    openSettingsScreen("babyDetail");
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

  async function handleUpdateMyRelation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken || !activeAlbum || !currentUser) {
      return;
    }
    const relation = myRelationDraft.trim();
    if (!relation) {
      setError("请先填写你与宝宝的关系。");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await updateMemberRelation(authToken, activeAlbum.album.id, currentUser.id, relation);
      setNotice("关系称呼已更新。");
      await refreshApp(activeAlbum.album.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新关系称呼失败。");
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
      switchTab("settings");
      openSettingsScreen("storage");
      return;
    }
    if (activeAlbum.membership.role === "viewer") {
      setNotice("当前身份没有上传权限。");
      return;
    }
    setEditingEntry(null);
    setDraftSheetOpen(true);
  }

  function handleOpenEditEntry(entryId: string) {
    const entry = albumTimeline.find((item) => item.id === entryId) ?? null;
    if (!entry) {
      return;
    }
    setEditingEntry(entry);
    setDraftSheetOpen(true);
  }

  function openLightbox(next: LightboxState) {
    setLightboxClosing(false);
    setLightbox(next);
  }

  function requestCloseLightbox() {
    if (!lightbox || lightboxClosing) {
      return;
    }
    setLightboxClosing(true);
  }

  function resetPullRefresh() {
    setPullStartY(null);
    setPullOffset(0);
    setPullReady(false);
  }

  async function triggerPullRefresh() {
    if (!activeAlbum || timelineRefreshing || timelineLoading) {
      resetPullRefresh();
      return;
    }
    setPullOffset(56);
    await replaceTimeline(activeAlbum.album.id, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
    resetPullRefresh();
  }

  function refreshTimelineSoon(targetAlbumId: string) {
    void replaceTimeline(targetAlbumId, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
    void refreshApp(targetAlbumId);
    window.setTimeout(() => {
      void replaceTimeline(targetAlbumId, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
      void refreshApp(targetAlbumId);
    }, 2000);
    window.setTimeout(() => {
      void replaceTimeline(targetAlbumId, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
      void refreshApp(targetAlbumId);
    }, 5000);
  }

  const activeAlbum = appState?.activeAlbum ?? null;
  const albumOptions = appState?.albums ?? [];
  const currentUser = appState?.currentUser ?? null;
  const activeBaby = activeAlbum?.baby ?? activeAlbum?.babies?.[0] ?? null;
  const albumTimeline = timelineEntries;
  const albumMembers = activeAlbum?.members ?? [];
  const albumInvites = activeAlbum?.invites ?? [];
  const storageNode = activeAlbum?.storageNode ?? null;
  const canManageInvites = activeAlbum?.membership.role === "owner" || activeAlbum?.membership.role === "admin";
  const canManageBabyProfile = activeAlbum?.membership.role === "owner" || activeAlbum?.membership.role === "admin";
  const canManageStorage = activeAlbum?.membership.role === "owner";
  const timelineDays = useMemo(() => buildTimelineFeed(albumTimeline, activeBaby?.birthDate), [albumTimeline, activeBaby?.birthDate]);
  const canUploadMedia = Boolean(activeAlbum && activeAlbum.membership.role !== "viewer" && storageNode);
  const transferCandidates = albumMembers.filter((member) => member.userId !== currentUser?.id);
  const activeStoragePairing = storagePairing && storagePairing.albumId === activeAlbum?.album.id ? storagePairing : null;
  const storageStatus = activeStoragePairing ? "pairing" : storageNode ? storageNode.status : "unpaired";
  const storageStatusSummary = activeStoragePairing
    ? `配对码待使用，${formatDateTime(activeStoragePairing.expiresAt)} 前有效`
    : storageNode
      ? storageNode.status === "online"
        ? `${storageNode.name} 在线，可继续处理新上传内容`
        : `${storageNode.name} 当前离线，恢复后会继续处理媒体`
      : canManageStorage
        ? "尚未接入储存设备，完成首次配对后即可上传和处理媒体"
        : "尚未接入储存设备，请联系 owner 完成首次配对";
  const storageFlowTitle = storageNode ? "更换、接回或补配储存设备" : "接入第一台储存设备";
  const storageUploadSummary = !storageNode
    ? "暂不可上传"
    : storageNode.status === "online"
      ? "可正常上传并处理"
      : "可继续上传，处理会在节点恢复后继续";
  const storagePairingModeLabel = storageNode ? "替换主节点" : "首次接入";
  const storagePairingActionLabel = storageNode ? "生成替换码" : "生成配对码";
  const settingsSceneClassName = `panelStack settingsDetailPage settingsScene ${settingsNavDirection === "forward" ? "settingsSceneForward" : "settingsSceneBack"}`;
  const hasPendingPreview = useMemo(
    () => albumTimeline.some((entry) => entry.items.some((item) => item.previewStatus !== "ready")),
    [albumTimeline]
  );

  useEffect(() => {
    if (!authToken || !activeAlbum) {
      timelineAlbumRef.current = "";
      setTimelineEntries([]);
      setTimelineNextCursor("");
      setTimelineHasMore(false);
      setTimelineLoading(false);
      setTimelineLoadingMore(false);
      setTimelineRefreshing(false);
      return;
    }
    timelineAlbumRef.current = activeAlbum.album.id;
    setTimelineEntries([]);
    setTimelineNextCursor("");
    setTimelineHasMore(false);
    void replaceTimeline(activeAlbum.album.id);
  }, [activeAlbum?.album.id, authToken]);

  useEffect(() => {
    if (activeTab !== "photos" || !activeAlbum || !timelineHasMore || timelineLoading || timelineLoadingMore || timelineRefreshing) {
      return;
    }
    const target = loadMoreSentinelRef.current;
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) {
        return;
      }
      void loadMoreTimeline(activeAlbum.album.id);
    }, { rootMargin: "240px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeAlbum, activeTab, timelineHasMore, timelineLoading, timelineLoadingMore, timelineRefreshing, timelineNextCursor]);

  useEffect(() => {
    if (!authToken || !activeAlbum || !hasPendingPreview) {
      return;
    }
    const timer = window.setInterval(() => {
      void replaceTimeline(activeAlbum.album.id, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeAlbum, authToken, hasPendingPreview, timelineEntries.length]);

  return (
    <main className={`appShell${authToken && activeAlbum ? " appShellAuthenticated" : ""}`}>
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
              <div aria-label="登录或注册" className="segmentedControl" role="tablist">
                <button
                  aria-selected={authMode === "login"}
                  className={`segmentedControlButton${authMode === "login" ? " segmentedControlButtonActive" : ""}`}
                  onClick={() => setAuthMode("login")}
                  type="button"
                >
                  登录
                </button>
                <button
                  aria-selected={authMode === "register"}
                  className={`segmentedControlButton${authMode === "register" ? " segmentedControlButtonActive" : ""}`}
                  onClick={() => setAuthMode("register")}
                  type="button"
                >
                  注册
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
            <RelationInput label="你与宝宝的关系" listId="invite-relation-empty" onChange={setInviteRelation} placeholder="例如：妈妈" value={inviteRelation} />
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
              <RelationInput label="你与宝宝的关系" listId="create-relation-empty" onChange={setCreateRelation} placeholder="例如：爸爸" value={createRelation} />
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
          <div className="tabViewport">
          <section
            aria-hidden={activeTab !== "photos"}
            className={`pageStack photosPage tabSection ${activeTab === "photos" ? "tabSectionActive" : "tabSectionInactive"}`}
            onTouchCancel={resetPullRefresh}
            onTouchEnd={() => {
              if (pullReady) {
                void triggerPullRefresh();
                return;
              }
              resetPullRefresh();
            }}
            onTouchMove={(event) => {
              if (pullStartY === null || draftSheetOpen || lightbox || activeTab !== "photos") {
                return;
              }
              if (window.scrollY > 0) {
                resetPullRefresh();
                return;
              }
              const delta = event.touches[0].clientY - pullStartY;
              if (delta <= 0) {
                resetPullRefresh();
                return;
              }
              event.preventDefault();
              const nextOffset = Math.min(PULL_REFRESH_MAX, delta * 0.42);
              setPullOffset(nextOffset);
              setPullReady(nextOffset >= PULL_REFRESH_TRIGGER);
            }}
            onTouchStart={(event) => {
              if (activeTab !== "photos" || draftSheetOpen || lightbox || timelineLoadingMore || timelineRefreshing || event.touches.length !== 1) {
                return;
              }
              if (window.scrollY > 0) {
                return;
              }
              setPullStartY(event.touches[0].clientY);
            }}
          >
              <div className="photosFeedShell">
                <div className={`pullRefreshIndicator${pullOffset > 0 || timelineRefreshing ? " pullRefreshIndicatorVisible" : ""}${pullReady ? " pullRefreshIndicatorReady" : ""}`}>
                  <div className={`pullRefreshSpinner${timelineRefreshing ? " pullRefreshSpinnerSpinning" : ""}`} />
                  <span>{timelineRefreshing ? "正在刷新" : pullReady ? "松手刷新" : "下拉刷新"}</span>
                </div>

                <div className="momentsPullLayer" style={pullOffset > 0 ? { transform: `translate3d(0, ${pullOffset}px, 0)` } : undefined}>
                  <article className="momentsHero panel">
                  <div className="momentsHeroBackdrop" />
                  <div className="momentsHeroBody">
                    <BabyAvatar albumId={activeAlbum.album.id} baby={activeBaby} className="momentsHeroAvatar" token={authToken} />
                    <div className="momentsHeroCopy">
                      <h2>{activeBaby?.name ?? activeAlbum.album.name}</h2>
                      <p className="momentsHeroMeta">{activeBaby?.birthDate ? `出生 ${formatDate(activeBaby.birthDate)}` : "还没有填写出生日期"}</p>
                    </div>
                    <div className="momentsHeroAside">
                      <p className="momentsHeroMeta">{timelineLoading && albumTimeline.length === 0 ? "正在加载" : `${albumTimeline.length} 条内容`}</p>
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
                    {timelineLoading && timelineDays.length === 0 ? <article className="panel panelStack"><p className="helperText">正在加载时间线...</p></article> : null}
                    {!timelineLoading && timelineDays.length === 0 ? <article className="panel panelStack"><p className="helperText">还没有媒体内容，先去上传一张照片吧。</p></article> : null}
                    {timelineDays.map((day) => (
                      <article className="momentDay" key={day.day}>
                        <header className="momentDayHeader">
                          <div>
                            <h3>{formatTimelineDate(day.day)}</h3>
                            <p>{day.itemsCount} 项</p>
                          </div>
                          {day.babyAgeLabel ? <span className="momentBabyDay">宝宝第 {day.babyAgeLabel}</span> : null}
                        </header>
                        <div className="momentBatchList">
                          {day.batches.map((batch) => <MomentCard albumId={activeAlbum.album.id} authToken={authToken} batch={batch} canEdit={canEditTimelineEntry(activeAlbum.membership.role, currentUser?.id, batch)} key={`${day.day}-${batch.batchId}`} onEdit={() => handleOpenEditEntry(batch.batchId)} onOpen={(index) => openLightbox({ albumId: activeAlbum.album.id, batch, index })} />)}
                        </div>
                      </article>
                    ))}
                    {timelineLoadingMore ? <div className="timelineFooterState"><div className="pullRefreshSpinner pullRefreshSpinnerSpinning" /><span>正在加载更多</span></div> : null}
                    {!timelineHasMore && albumTimeline.length > 0 ? <div className="timelineFooterState timelineFooterStateDone"><span>已经到底了</span></div> : null}
                    <div className="timelineLoadMoreSentinel" ref={loadMoreSentinelRef} />
                  </div>
                </div>
              </div>
            </section>

            <section aria-hidden={activeTab !== "settings"} className={`pageStack settingsPage tabSection ${activeTab === "settings" ? "tabSectionActive" : "tabSectionInactive"}`}>
              {settingsScreen === "menu" ? (
                <div className={`settingsScene settingsRootScene ${settingsNavDirection === "back" ? "settingsRootSceneBack" : "settingsRootSceneForward"}`}>
                  <article className="settingsHero panel">
                    <div className="settingsHeroBackdrop" />
                    <div className="settingsHeroBody">
                      <div className="settingsHeroCopy">
                        <p className="eyebrow">设置</p>
                        <h2>管理账号、宝宝和储存节点</h2>
                        <p className="helperText">当前正在查看 {activeBaby?.name ?? activeAlbum.album.name} 的相册空间。</p>
                      </div>
                      <div className="sessionBadge settingsSessionBadge">
                        <strong>{currentUser?.displayName}</strong>
                        <span>{currentUser?.email}</span>
                        <span>{memberRelationLabel(activeAlbum.membership)} · {roleLabel(activeAlbum.membership.role)}</span>
                      </div>
                    </div>
                  </article>

                  <article className="settingsMenu">
                    <button className="settingsMenuItem panel" onClick={() => openSettingsScreen("account")} type="button">
                      <span className="settingsMenuBody">
                        <span className="settingsMenuPrimary">账户管理</span>
                        <span className="settingsMenuMeta">查看当前登录账号和你在相册中的身份</span>
                      </span>
                      <span className="settingsChevron">›</span>
                    </button>
                    <button className="settingsMenuItem panel" onClick={() => openSettingsScreen("babies")} type="button">
                      <span className="settingsMenuBody">
                        <span className="settingsMenuPrimary">宝宝管理</span>
                        <span className="settingsMenuMeta">切换、编辑或新增宝宝相册</span>
                      </span>
                      <span className="settingsChevron">›</span>
                    </button>
                    <button className="settingsMenuItem panel" onClick={() => openSettingsScreen("storage")} type="button">
                      <span className="settingsMenuBody">
                        <span className="settingsMenuPrimary">储存节点管理</span>
                        <span className="settingsMenuMeta">{storageStatusSummary}</span>
                      </span>
                      <span className={`settingsStatusChip settingsStatusChip${storageStatus === "online" ? "Online" : storageStatus === "offline" ? "Offline" : storageStatus === "pairing" ? "Pending" : "Idle"}`}>
                        {storageStatus === "online" ? "在线" : storageStatus === "offline" ? "离线" : storageStatus === "pairing" ? "待配对" : "未接入"}
                      </span>
                    </button>
                    <button className="settingsMenuItem settingsMenuDanger panel" onClick={handleLogout} type="button">
                      <span className="settingsMenuBody">
                        <span className="settingsMenuPrimary">退出登录</span>
                        <span className="settingsMenuMeta">清除当前设备上的登录状态</span>
                      </span>
                      <span className="settingsChevron">›</span>
                    </button>
                  </article>
                </div>
              ) : null}

              {settingsScreen === "account" ? (
                <article className={settingsSceneClassName}>
                  <SettingsHeader eyebrow="账户管理" onBack={() => openSettingsScreen("menu", "back")} title="账户信息" />
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">账户概览</p>
                    <div className="settingsIdentityRow">
                      <span aria-hidden="true" className="settingsCardAvatar settingsIdentityAvatar">{babyAvatarText(currentUser?.displayName)}</span>
                      <div className="settingsIdentityBody">
                        <strong>{currentUser?.displayName}</strong>
                        <p className="helperText">{currentUser?.email}</p>
                      </div>
                    </div>
                    <div className="settingsInfoList">
                      <div className="settingsInfoRow">
                        <span className="helperText">当前宝宝</span>
                        <strong>{activeBaby?.name ?? activeAlbum.album.name}</strong>
                      </div>
                      <div className="settingsInfoRow">
                        <span className="helperText">关系称呼</span>
                        <strong>{memberRelationLabel(activeAlbum.membership)}</strong>
                      </div>
                      <div className="settingsInfoRow">
                        <span className="helperText">当前权限</span>
                        <strong>{roleLabel(activeAlbum.membership.role)}</strong>
                      </div>
                    </div>
                  </article>
                </article>
              ) : null}

              {settingsScreen === "babies" ? (
                <article className={settingsSceneClassName}>
                  <SettingsHeader actionLabel="添加" eyebrow="宝宝管理" onAction={() => openSettingsScreen("addBaby")} onBack={() => openSettingsScreen("menu", "back")} title="已加入的宝宝" />
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
                          <span className="settingsMenuMeta">{memberRelationLabel(item.membership)}</span>
                        </span>
                        <span className="settingsMenuMeta">›</span>
                      </button>
                    ))}
                  </div>
                </article>
              ) : null}

              {settingsScreen === "addBaby" ? (
                <article className={settingsSceneClassName}>
                  <SettingsHeader eyebrow="添加宝宝" onBack={() => openSettingsScreen("babies", "back")} title="新建或加入" />
                  <form className="panelStack panel" onSubmit={handleCreateAlbum}>
                    <p className="settingsCardTitle">自己新建</p>
                    <label>宝宝姓名<input value={babyName} onChange={(event) => setBabyName(event.target.value)} /></label>
                    <label>出生日期<input type="date" value={babyBirthDate} onChange={(event) => setBabyBirthDate(event.target.value)} /></label>
                    <RelationInput label="你与宝宝的关系" listId="create-relation-settings" onChange={setCreateRelation} placeholder="例如：爸爸" value={createRelation} />
                    <label>宝宝头像<input accept="image/*" onChange={(event) => setCreateBabyAvatarFile(event.target.files?.[0] ?? null)} type="file" /></label>
                    <button type="submit">创建宝宝</button>
                  </form>
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">邀请码加入</p>
                    <label>邀请码<input value={inviteCodeInput} onChange={(event) => setInviteCodeInput(event.target.value)} /></label>
                    <RelationInput label="你与宝宝的关系" listId="invite-relation-settings" onChange={setInviteRelation} placeholder="例如：阿姨" value={inviteRelation} />
                    <button onClick={() => void handleAcceptInvite()} type="button">加入宝宝</button>
                  </article>
                </article>
              ) : null}

              {settingsScreen === "babyDetail" ? (
                <article className={settingsSceneClassName}>
                  <SettingsHeader eyebrow="宝宝管理" onBack={() => openSettingsScreen("babies", "back")} title={activeBaby?.name ?? activeAlbum.album.name} />
                  <article className="panelStack panel">
                    <p className="settingsCardTitle">我的角色</p>
                    <form className="formGrid" onSubmit={handleUpdateMyRelation}>
                      <RelationInput label="你与宝宝的关系" listId="my-relation" onChange={setMyRelationDraft} placeholder="例如：妈妈" value={myRelationDraft} />
                      <button type="submit">保存称呼</button>
                    </form>
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
                        <button className="settingsCardButton settingsMemberCard" key={member.userId} onClick={() => openSettingsScreen("memberDetail", "forward", { memberId: member.userId })} type="button">
                          <span className="settingsCardAvatar" aria-hidden="true">{babyAvatarText(member.displayName)}</span>
                          <span className="settingsCardBody">
                            <span className="settingsMenuPrimary">{member.displayName}</span>
                            <span className="settingsMenuMeta">{memberRelationLabel(member)}</span>
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
                          <button type="submit">生成邀请码</button>
                        </form>
                        <p className="helperText">邀请码默认让对方以最低可用权限加入。</p>
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
                <article className={settingsSceneClassName}>
                  <SettingsHeader eyebrow="成员详情" onBack={() => openSettingsScreen("babyDetail", "back")} title={albumMembers.find((member) => member.userId === settingsMemberId)?.displayName ?? "成员"} />
                  {albumMembers.filter((member) => member.userId === settingsMemberId).map((member) => (
                    <article className="panelStack panel" key={member.userId}>
                      <p className="settingsCardTitle">成员信息</p>
                      <p><strong>{member.displayName}</strong></p>
                      <p className="helperText">与宝宝的关系：{memberRelationLabel(member)}</p>
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
                <article className={settingsSceneClassName}>
                  <SettingsHeader eyebrow="储存节点管理" onBack={() => openSettingsScreen("menu", "back")} title="相册储存" />
                  <article className="panel storageFlowHero">
                    <div className="storageFlowHeroTop">
                      <div className="storageFlowHeroCopy">
                        <p className="settingsCardTitle">当前相册</p>
                        <h3>{activeBaby?.name ?? activeAlbum.album.name}</h3>
                        <p className="helperText">{storageStatusSummary}</p>
                      </div>
                      <span className={`settingsStatusChip settingsStatusChipLarge settingsStatusChip${storageStatus === "online" ? "Online" : storageStatus === "offline" ? "Offline" : storageStatus === "pairing" ? "Pending" : "Idle"}`}>
                        {storageStatus === "online" ? "在线" : storageStatus === "offline" ? "离线" : storageStatus === "pairing" ? "待配对" : "未接入"}
                      </span>
                    </div>
                    <div className="settingsInfoList storageFlowSummary">
                      <div className="settingsInfoRow">
                        <span className="helperText">上传处理</span>
                        <strong>{storageUploadSummary}</strong>
                      </div>
                      <div className="settingsInfoRow">
                        <span className="helperText">当前主节点</span>
                        <strong>{storageNode ? storageNode.name : "尚未绑定"}</strong>
                      </div>
                      <div className="settingsInfoRow">
                        <span className="helperText">切换相册</span>
                        <label className="storageAlbumPicker">
                          <select value={activeAlbum.album.id} onChange={(event) => void refreshApp(event.target.value)}>
                            {albumOptions.map((item) => (
                              <option key={item.album.id} value={item.album.id}>{item.baby?.name ?? item.album.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </article>

                  <article className="panelStack panel">
                    <div className="storageSectionHeader">
                      <div>
                        <p className="settingsCardTitle">使用流程</p>
                        <strong>{storageFlowTitle}</strong>
                      </div>
                      {canManageStorage ? <button onClick={() => void handleCreateStoragePairing()} type="button">{storagePairingActionLabel}</button> : null}
                    </div>
                    <div className="storageStepList">
                      <article className={`storageStepCard ${activeStoragePairing ? "storageStepCardActive" : storageNode ? "storageStepCardDone" : "storageStepCardCurrent"}`}>
                        <span className="storageStepIndex">1</span>
                        <div className="storageStepBody">
                          <strong>{storagePairingActionLabel}</strong>
                          <p className="helperText">{canManageStorage ? `owner 生成 8 位短码，用于${storagePairingModeLabel}。` : "由相册 owner 生成 8 位短码后再继续。"} </p>
                        </div>
                      </article>
                      <article className={`storageStepCard ${activeStoragePairing ? "storageStepCardCurrent" : storageNode ? "storageStepCardDone" : ""}`}>
                        <span className="storageStepIndex">2</span>
                        <div className="storageStepBody">
                          <strong>在设备上完成配对</strong>
                          <p className="helperText">{storageNode ? "让新设备使用这个短码接入；接入成功后它会成为当前主节点。" : "在 NAS 或小主机上启动 agent，并输入这个短码完成首次接入。"} </p>
                        </div>
                      </article>
                      <article className={`storageStepCard ${storageNode ? "storageStepCardCurrent" : ""}`}>
                        <span className="storageStepIndex">3</span>
                        <div className="storageStepBody">
                          <strong>{storageNode ? "等待媒体继续处理" : "开始上传媒体"}</strong>
                          <p className="helperText">{storageNode ? "节点在线后，新上传会继续进入处理队列；替换主节点时，历史媒体会在后台自动补齐。" : "节点上线后，这个相册里的照片和视频上传入口会自动解锁。"} </p>
                        </div>
                      </article>
                    </div>
                    {!canManageStorage ? <p className="helperText">你可以查看当前储存状态，但只有 owner 可以生成配对码或替换主节点。</p> : null}
                  </article>

                  <article className="panelStack panel">
                    <div className="storageSectionHeader">
                      <div>
                        <p className="settingsCardTitle">当前主节点</p>
                        <strong>{storageNode ? storageNode.name : "还没有接入储存设备"}</strong>
                      </div>
                    </div>
                    {storageNode ? (
                      <>
                        <div className="storageNodeHeader">
                          <div>
                            <div className="storageNodeStatusRow">
                              <span className={`storageNodeDot ${storageNode.status === "online" ? "storageNodeDotOnline" : "storageNodeDotOffline"}`} />
                              <span className="storageNodeStatusLabel">{storageNode.status === "online" ? "在线，正在处理新内容" : "离线，恢复后会继续处理"}</span>
                            </div>
                            <p className="helperText storageNodeHeartbeat">最近心跳：{formatDateTime(storageNode.lastSeenAt)}</p>
                          </div>
                        </div>
                        <div className="summaryGrid storageMetricsGrid">
                          <article className="metricCard">
                            <span>可用空间</span>
                            <strong>{formatBytes(storageNode.availableBytes)}</strong>
                          </article>
                          <article className="metricCard">
                            <span>总容量</span>
                            <strong>{formatBytes(storageNode.totalBytes)}</strong>
                          </article>
                        </div>
                        <div className="storageInfoList">
                          <p className="storageInfoItem">上传会先进入云端原始存储，再由当前主节点处理预览和本地落盘。</p>
                          <p className="storageInfoItem">{storageNode.status === "online" ? "当前节点在线，新的照片和视频会正常进入处理链路。" : "当前节点离线时仍可保留已有内容浏览；新上传内容会在节点恢复后继续处理。"}</p>
                        </div>
                      </>
                    ) : (
                      <div className="storageEmptyState">
                        <strong>还没有接入储存设备</strong>
                        <p className="helperText">完成首次配对后，这个相册才会开始处理照片和视频上传。</p>
                      </div>
                    )}
                  </article>

                  <article className="panelStack panel">
                    <div className="storageSectionHeader">
                      <div>
                        <p className="settingsCardTitle">当前配对码</p>
                        <strong>{activeStoragePairing ? "等待设备接入" : "暂无待使用配对码"}</strong>
                      </div>
                      {canManageStorage ? <button className="secondaryButton" onClick={() => void handleCreateStoragePairing()} type="button">{activeStoragePairing ? "重新生成" : storagePairingActionLabel}</button> : null}
                    </div>
                    {activeStoragePairing ? (
                      <>
                        <div className="storagePairingCard">
                          <div className="storagePairingMeta">
                            <span className="settingsStatusChip settingsStatusChipPending">{storagePairingModeLabel}</span>
                            <p className="helperText">有效期至 {formatDateTime(activeStoragePairing.expiresAt)}</p>
                          </div>
                          <p className="inviteLink">{activeStoragePairing.code}</p>
                          <div className="storageInfoList">
                            <p className="storageInfoItem">在储存设备的 agent 配对步骤中输入这 8 位短码即可完成接入。</p>
                            <p className="storageInfoItem">{storageNode ? "新设备接入成功后会切换成当前主节点，旧节点上的已完成媒体会在后台自动补齐到新主节点。" : "首次接入成功后，上传入口会自动恢复可用。"} </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="helperText">{canManageStorage ? "需要时再生成一个短码即可。新的短码适用于当前相册，24 小时后自动失效。" : "当前没有待使用配对码。若要接入或更换设备，请联系 owner 生成。"}</p>
                    )}
                  </article>
                </article>
              ) : null}
            </section>
          </div>
        </>
      ) : null}

      {loading ? <p className="helperText loadingRow">正在同步最新状态...</p> : null}

      {lightbox ? <LightboxViewer authToken={authToken} closing={lightboxClosing} lightbox={lightbox} onClose={requestCloseLightbox} onNavigate={(direction) => setLightbox((current) => current ? moveLightbox(current, direction) : current)} /> : null}
      {authToken && activeAlbum ? <UploadDraftSheet albumId={activeAlbum.album.id} authToken={authToken} babyName={activeBaby?.name} disabled={!canUploadMedia && !editingEntry} disabledReason={!storageNode ? "上传前需要先完成 NAS 配对。" : "当前身份没有上传权限。"} editingEntry={editingEntry} onClose={() => {
        setDraftSheetOpen(false);
      }} onDeleted={() => refreshTimelineSoon(activeAlbum.album.id)} onUploaded={() => refreshTimelineSoon(activeAlbum.album.id)} open={draftSheetOpen} /> : null}

      {authToken && activeAlbum && activeTab === "photos" ? (
        <button className="floatingAddButton" onClick={handleOpenUploadFlow} type="button">+</button>
      ) : null}

      {authToken && activeAlbum ? (
        <nav className={`bottomNav${draftSheetOpen ? " bottomNavHidden" : ""}`}>
          <button className={activeTab === "photos" ? "navActive" : ""} onClick={() => switchTab("photos")} type="button">照片</button>
          <button className={activeTab === "settings" ? "navActive" : ""} onClick={() => switchTab("settings")} type="button">设置</button>
        </nav>
      ) : null}
    </main>
  );
}

type TimelineBatch = {
  batchId: string;
  uploadedBy: string;
  uploadedAt: string;
  uploadedByName: string;
  caption: string;
  visibility: TimelineEntry["visibility"];
  timeMode: TimelineEntry["timeMode"];
  displayAt: string;
  timelineDay: string;
  entry: TimelineEntry;
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

function MomentCard({ authToken, albumId, batch, canEdit, onEdit, onOpen }: { authToken: string; albumId: string; batch: TimelineBatch; canEdit: boolean; onEdit: () => void; onOpen: (index: number) => void }) {
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
      <div className="momentCardFooter">
        <div className="momentMetaGroup">
          <p className="momentMeta">{batch.uploadedByName || "家人"} 上传于 {formatRelativeUploadTime(batch.uploadedAt)}</p>
          {batch.visibility === "managers" ? <p className="momentMeta">仅管理员和所有者可见</p> : null}
        </div>
        {canEdit ? <button className="momentEditButton" onClick={onEdit} type="button">编辑</button> : null}
      </div>
    </article>
  );
}

function MomentVideo({ authToken, albumId, item, onOpen }: { authToken: string; albumId: string; item: MediaAsset; onOpen: () => void }) {
  return (
    <div className="momentVideo">
      <MomentThumb albumId={albumId} authToken={authToken} item={item} large onOpen={onOpen} />
      <div aria-hidden="true" className="momentVideoPlay">
        <span className="momentVideoPlayTriangle" />
      </div>
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

function LightboxViewer({ authToken, lightbox, closing, onClose, onNavigate }: { authToken: string; lightbox: LightboxState; closing: boolean; onClose: () => void; onNavigate: (direction: -1 | 1) => void }) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const currentItem = lightbox.batch.items[lightbox.index];
  const isVideo = currentItem.mediaType.startsWith("video/");
  const originalUrl = getOriginalUrl(currentItem.id, lightbox.albumId, authToken);
  const previewUrl = getPreviewUrl(currentItem.id, lightbox.albumId, authToken, currentItem.processedAt ?? currentItem.uploadedAt);
  const hasMultiple = lightbox.batch.items.length > 1;
  const [displayUrl, setDisplayUrl] = useState(originalUrl);

  useEffect(() => {
    setDisplayUrl(originalUrl);
  }, [originalUrl]);

  useEffect(() => {
    if (closing) {
      setVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [closing]);

  return (
    <div className={`lightboxOverlay${visible ? " lightboxOverlayOpen" : ""}${closing ? " lightboxOverlayClosing" : ""}`} onClick={onClose} role="dialog" aria-modal="true">
      <div className={`lightboxShell${visible ? " lightboxShellOpen" : ""}${closing ? " lightboxShellClosing" : ""}`} onClick={(event) => event.stopPropagation()}>
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
          {isVideo ? (
            <video
              autoPlay
              className="lightboxVideo"
              controls
              playsInline
              poster={currentItem.previewStatus === "ready" ? previewUrl : undefined}
              src={originalUrl}
            />
          ) : currentItem.previewStatus === "ready" ? (
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

function SettingsHeader({ eyebrow, onBack, title, actionLabel, onAction }: { eyebrow: string; onBack: () => void; title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <header className="settingsNavBar">
      <button className="draftTopAction settingsNavBack" onClick={onBack} type="button">返回</button>
      <div className="settingsNavTitle">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {actionLabel && onAction ? (
        <button className="draftTopPrimary settingsNavAction" onClick={onAction} type="button">{actionLabel}</button>
      ) : (
        <span className="settingsNavSpacer" />
      )}
    </header>
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

function RelationInput({ label, listId, onChange, placeholder, value }: { label: string; listId: string; onChange: (value: string) => void; placeholder: string; value: string }) {
  return (
    <label>
      {label}
      <input list={listId} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
      <datalist id={listId}>
        {RELATION_OPTIONS.map((item) => <option key={item} value={item} />)}
      </datalist>
    </label>
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
      uploadedBy: entry.uploadedBy,
      uploadedAt: entry.uploadedAt,
      uploadedByName: entry.uploadedByName,
      caption: entry.caption,
      visibility: entry.visibility,
      timeMode: entry.timeMode,
      displayAt: entry.displayAt,
      timelineDay: entry.timelineDay,
      entry,
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

function canEditTimelineEntry(role: Role, currentUserId: string | undefined, batch: TimelineBatch) {
  if (role === "owner" || role === "admin") {
    return true;
  }
  return Boolean(currentUserId) && currentUserId === batch.uploadedBy;
}

function memberRelationLabel(member?: Pick<AlbumMember, "relation"> | null) {
  const relation = member?.relation?.trim();
  return relation || "未设置关系";
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
