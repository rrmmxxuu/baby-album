"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { acceptInvite, ApiError, createAlbum, loadAppState, loginUser, logoutUser, registerUser, uploadBabyAvatar } from "../../../lib/api";
import type { AppStatePayload } from "../../../lib/types";
import { ALBUM_STORAGE_KEY, BOOT_SPLASH_EXIT_MS, BOOT_SPLASH_MIN_MS, LAST_VIEWED_PHOTO_BABY_STORAGE_KEY } from "../model/constants";
import { buildFeedback, errorMessageFromUnknown } from "../model/feedback";
import { buildAuthPath, buildBabyPhotosPath, buildPhotosHubPath, buildWelcomePath } from "../model/routes";
import type { AuthMode } from "../model/types";

interface RefreshOptions {
  silent?: boolean;
  authenticated?: boolean;
}

function isProtectedPathname(pathname: string) {
  return pathname === "/welcome"
    || pathname === "/photos"
    || pathname === "/feeding"
    || pathname === "/settings"
    || pathname.startsWith("/settings/")
    || pathname.startsWith("/babies/");
}

export function useAppSession(queryInviteCode: string, initialAuthenticated = false) {
  const router = useRouter();
  const pathname = usePathname();
  const [origin, setOrigin] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [bootPhase, setBootPhase] = useState<"loading" | "exiting" | "done">("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  const [appState, setAppState] = useState<AppStatePayload | null>(null);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [createRelation, setCreateRelation] = useState("");
  const [inviteRelation, setInviteRelation] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<ReturnType<typeof buildFeedback> | null>(null);

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [babyName, setBabyName] = useState("");
  const [babyBirthDate, setBabyBirthDate] = useState("");
  const [createBabyAvatarFile, setCreateBabyAvatarFile] = useState<File | null>(null);

  const bootStartedAtRef = useRef(0);
  const bootMinTimerRef = useRef<number | null>(null);
  const bootExitTimerRef = useRef<number | null>(null);
  const bootstrappedRef = useRef(false);
  const recoveryKeyRef = useRef("");
  const feedbackIdRef = useRef(0);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const showSuccess = useCallback((title: string, message: string) => {
    feedbackIdRef.current += 1;
    setFeedback(buildFeedback(feedbackIdRef.current, "success", title, message));
  }, []);

  const showWarning = useCallback((title: string, message: string) => {
    feedbackIdRef.current += 1;
    setFeedback(buildFeedback(feedbackIdRef.current, "warning", title, message));
  }, []);

  const showError = useCallback((title: string, message: string) => {
    feedbackIdRef.current += 1;
    setFeedback(buildFeedback(feedbackIdRef.current, "error", title, message));
  }, []);

  const resolvePostAuthPath = useCallback((next: AppStatePayload | null) => {
    const hasJoinedBaby = (next?.albums ?? []).some((item) => Boolean(item.baby));
    return hasJoinedBaby ? buildPhotosHubPath() : buildWelcomePath();
  }, []);

  const clearSession = useCallback((showNotice = true) => {
    window.localStorage.removeItem(ALBUM_STORAGE_KEY);
    window.localStorage.removeItem(LAST_VIEWED_PHOTO_BABY_STORAGE_KEY);
    setIsAuthenticated(false);
    setSelectedAlbumId("");
    setAppState(null);
    if (showNotice) {
      showSuccess("已退出登录", "下次访问需要重新登录。");
    }
  }, [showSuccess]);

  const refreshApp = useCallback(async (targetAlbumId?: string, options?: RefreshOptions) => {
    const authenticated = options?.authenticated ?? isAuthenticated;
    if (!authenticated) {
      return null;
    }
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const next = await loadAppState(targetAlbumId);
      setAppState(next);
      const albumId = next.activeAlbumId ?? "";
      setSelectedAlbumId(albumId);
      if (albumId) {
        window.localStorage.setItem(ALBUM_STORAGE_KEY, albumId);
      } else {
        window.localStorage.removeItem(ALBUM_STORAGE_KEY);
      }
      return next;
    } catch (err) {
      const unauthorized = err instanceof ApiError && err.status === 401;
      const message = errorMessageFromUnknown(err, "加载数据失败。", {
        unauthorizedMessage: "请重新登录后再试。"
      });
      if (unauthorized) {
        clearSession(false);
        router.replace(buildAuthPath(queryInviteCode));
      }
      showError(message === "请重新登录后再试。" ? "登录状态已失效" : "同步失败", message);
      return null;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [clearSession, isAuthenticated, queryInviteCode, router, showError]);

  useEffect(() => {
    bootStartedAtRef.current = performance.now();
    setHydrated(true);
    setOrigin(window.location.origin);
    if (initialAuthenticated) {
      setIsAuthenticated(true);
      setSelectedAlbumId(window.localStorage.getItem(ALBUM_STORAGE_KEY) ?? "");
    } else {
      window.localStorage.removeItem(ALBUM_STORAGE_KEY);
      window.localStorage.removeItem(LAST_VIEWED_PHOTO_BABY_STORAGE_KEY);
      setSelectedAlbumId("");
    }
    setInviteCodeInput(queryInviteCode);
  }, [initialAuthenticated, queryInviteCode]);

  useEffect(() => () => {
    if (bootMinTimerRef.current !== null) {
      window.clearTimeout(bootMinTimerRef.current);
    }
    if (bootExitTimerRef.current !== null) {
      window.clearTimeout(bootExitTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;
    let cancelled = false;

    function finishBoot() {
      if (cancelled || bootPhase === "done") {
        return;
      }
      if (bootMinTimerRef.current !== null) {
        window.clearTimeout(bootMinTimerRef.current);
      }
      const elapsed = performance.now() - bootStartedAtRef.current;
      const waitMs = Math.max(0, BOOT_SPLASH_MIN_MS - elapsed);
      bootMinTimerRef.current = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setBootPhase("exiting");
        bootExitTimerRef.current = window.setTimeout(() => {
          if (!cancelled) {
            setBootPhase("done");
          }
        }, BOOT_SPLASH_EXIT_MS);
      }, waitMs);
    }

    async function bootstrap() {
      if (!isAuthenticated) {
        finishBoot();
        return;
      }
      try {
        await refreshApp(selectedAlbumId || undefined, { silent: true });
      } finally {
        finishBoot();
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !isAuthenticated || appState || bootPhase !== "done") {
      if (!isAuthenticated || appState) {
        recoveryKeyRef.current = "";
      }
      return;
    }

    const key = `authenticated:${selectedAlbumId}`;
    if (recoveryKeyRef.current === key) {
      return;
    }
    recoveryKeyRef.current = key;
    void refreshApp(selectedAlbumId || undefined, { silent: true });
  }, [appState, bootPhase, hydrated, isAuthenticated, refreshApp, selectedAlbumId]);

  useEffect(() => {
    if (!hydrated || isAuthenticated || !isProtectedPathname(pathname)) {
      return;
    }
    setIsAuthenticated(true);
  }, [hydrated, isAuthenticated, pathname]);

  useEffect(() => {
    if (!hydrated || !isAuthenticated || bootPhase !== "done" || !isProtectedPathname(pathname) || appState || loading) {
      return;
    }
    void refreshApp(selectedAlbumId || undefined, { silent: true });
  }, [appState, bootPhase, hydrated, isAuthenticated, loading, pathname, refreshApp, selectedAlbumId]);

  function saveSession() {
    setIsAuthenticated(true);
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    try {
      const auth = await registerUser({ displayName: registerName, email: registerEmail, password: registerPassword });
      saveSession();
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      showSuccess("注册成功", `欢迎，${auth.user.displayName}。请继续加入已有相册，或创建第一个宝宝相册。`);
      const next = await refreshApp(undefined, { authenticated: true });
      router.replace(resolvePostAuthPath(next));
    } catch (err) {
      showError("注册失败", errorMessageFromUnknown(err, "注册失败。"));
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    try {
      const auth = await loginUser({ email: loginEmail, password: loginPassword });
      saveSession();
      setLoginEmail("");
      setLoginPassword("");
      showSuccess("登录成功", `欢迎回来，${auth.user.displayName}。`);
      const next = await refreshApp(undefined, { authenticated: true });
      router.replace(resolvePostAuthPath(next));
    } catch (err) {
      showError("登录失败", errorMessageFromUnknown(err, "登录失败。", {
        unauthorizedMessage: "邮箱或密码不正确，或账号还不存在。"
      }));
    }
  }

  const handleLogout = useCallback(async () => {
    clearSession();
    try {
      if (isAuthenticated) {
        await logoutUser();
      }
    } catch {
      // Keep local logout deterministic even if the API call fails.
    }
  }, [clearSession, isAuthenticated]);

  async function handleCreateAlbum(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) {
      return;
    }
    clearFeedback();
    try {
      const name = babyName.trim();
      if (!name) {
        showWarning("请补充信息", "请先填写宝宝姓名。");
        return;
      }
      const relation = createRelation.trim();
      if (!relation) {
        showWarning("请补充信息", "请先填写你与宝宝的关系。");
        return;
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
      const album = await createAlbum({
        name: `${name}的宝宝相册`,
        timezone,
        babyName: name,
        birthDate: babyBirthDate ? new Date(`${babyBirthDate}T00:00:00Z`).toISOString() : undefined,
        relation
      });
      const createdState = await loadAppState(album.id);
      const createdBaby = createdState.activeAlbum?.baby ?? createdState.albums.find((item) => item.album.id === album.id)?.baby ?? null;
      if (createBabyAvatarFile) {
        if (createdBaby) {
          await uploadBabyAvatar(album.id, createdBaby.id, createBabyAvatarFile);
        }
      }
      setBabyName("");
      setBabyBirthDate("");
      setCreateRelation("");
      setCreateBabyAvatarFile(null);
      setSelectedAlbumId(album.id);
      window.localStorage.setItem(ALBUM_STORAGE_KEY, album.id);
      if (createdBaby) {
        window.localStorage.setItem(LAST_VIEWED_PHOTO_BABY_STORAGE_KEY, createdBaby.id);
      }
      showSuccess("创建成功", "宝宝相册已创建。");
      await refreshApp(album.id);
      router.replace(createdBaby ? buildBabyPhotosPath(createdBaby.id) : buildPhotosHubPath());
    } catch (err) {
      showError("创建失败", errorMessageFromUnknown(err, "创建宝宝相册失败。"));
    }
  }

  async function handleAcceptInvite(code?: string) {
    if (!isAuthenticated) {
      return;
    }
    const inviteCode = (code ?? inviteCodeInput).trim();
    if (!inviteCode) {
      showWarning("请补充信息", "请输入邀请码。");
      return;
    }
    clearFeedback();
    try {
      const relation = inviteRelation.trim();
      if (!relation) {
        showWarning("请补充信息", "请先填写你与宝宝的关系。");
        return;
      }
      const accepted = await acceptInvite(inviteCode, relation);
      setSelectedAlbumId(accepted.albumId);
      window.localStorage.setItem(ALBUM_STORAGE_KEY, accepted.albumId);
      setInviteRelation("");
      showSuccess("加入成功", "你已加入这个宝宝相册。");
      const next = await refreshApp(accepted.albumId);
      const acceptedBaby = next?.activeAlbum?.baby ?? next?.albums.find((item) => item.album.id === accepted.albumId)?.baby ?? null;
      if (acceptedBaby) {
        window.localStorage.setItem(LAST_VIEWED_PHOTO_BABY_STORAGE_KEY, acceptedBaby.id);
      }
      router.replace(acceptedBaby ? buildBabyPhotosPath(acceptedBaby.id) : buildPhotosHubPath());
    } catch (err) {
      showError("加入失败", errorMessageFromUnknown(err, "加入相册失败。"));
    }
  }

  return {
    origin,
    hydrated,
    bootPhase,
    authMode,
    setAuthMode,
    isAuthenticated,
    selectedAlbumId,
    appState,
    inviteCodeInput,
    setInviteCodeInput,
    createRelation,
    setCreateRelation,
    inviteRelation,
    setInviteRelation,
    loading,
    feedback,
    clearFeedback,
    showSuccess,
    showWarning,
    showError,
    registerName,
    setRegisterName,
    registerEmail,
    setRegisterEmail,
    registerPassword,
    setRegisterPassword,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    babyName,
    setBabyName,
    babyBirthDate,
    setBabyBirthDate,
    createBabyAvatarFile,
    setCreateBabyAvatarFile,
    refreshApp,
    handleRegister,
    handleLogin,
    handleLogout,
    handleCreateAlbum,
    handleAcceptInvite
  };
}

export type AppSessionState = ReturnType<typeof useAppSession>;
