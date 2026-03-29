"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite, createAlbum, loadAppState, loginUser, logoutUser, registerUser, uploadBabyAvatar } from "../../../lib/api";
import type { AppStatePayload } from "../../../lib/types";
import { ALBUM_STORAGE_KEY, BOOT_SPLASH_EXIT_MS, BOOT_SPLASH_MIN_MS, TOKEN_STORAGE_KEY } from "../model/constants";
import { buildFeedback, errorMessageFromUnknown } from "../model/feedback";
import { buildAlbumPath, buildAlbumsPath } from "../model/routes";
import type { AuthMode } from "../model/types";

interface RefreshOptions {
  silent?: boolean;
  token?: string;
}

export function useAppSession(queryInviteCode: string) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [bootPhase, setBootPhase] = useState<"loading" | "exiting" | "done">("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authToken, setAuthToken] = useState("");
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

  const clearSession = useCallback((showNotice = true) => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ALBUM_STORAGE_KEY);
    setAuthToken("");
    setSelectedAlbumId("");
    setAppState(null);
    if (showNotice) {
      showSuccess("已退出登录", "下次访问需要重新登录。");
    }
  }, [showSuccess]);

  const refreshApp = useCallback(async (targetAlbumId?: string, options?: RefreshOptions) => {
    const sessionToken = options?.token ?? authToken;
    if (!sessionToken) {
      return null;
    }
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const next = await loadAppState(sessionToken, targetAlbumId);
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
      const unauthorized = err instanceof Error && err.message.includes("unauthorized");
      const message = errorMessageFromUnknown(err, "加载数据失败。", {
        unauthorizedMessage: "请重新登录后再试。"
      });
      if (unauthorized) {
        clearSession(false);
      }
      showError(message === "请重新登录后再试。" ? "登录状态已失效" : "同步失败", message);
      return null;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [authToken, clearSession, showError]);

  useEffect(() => {
    bootStartedAtRef.current = performance.now();
    setHydrated(true);
    setOrigin(window.location.origin);
    setAuthToken(window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
    setSelectedAlbumId(window.localStorage.getItem(ALBUM_STORAGE_KEY) ?? "");
    setInviteCodeInput(queryInviteCode);
  }, [queryInviteCode]);

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
      if (!authToken) {
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
  }, [authToken, bootPhase, hydrated, refreshApp, selectedAlbumId]);

  function saveSession(token: string) {
    setAuthToken(token);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    try {
      const auth = await registerUser({ displayName: registerName, email: registerEmail, password: registerPassword });
      saveSession(auth.token);
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      showSuccess("注册成功", `欢迎，${auth.user.displayName}。请继续加入已有相册，或创建第一个宝宝相册。`);
      const next = await refreshApp(undefined, { token: auth.token });
      router.replace(next?.activeAlbumId ? buildAlbumPath(next.activeAlbumId, "photos") : buildAlbumsPath(queryInviteCode));
    } catch (err) {
      showError("注册失败", errorMessageFromUnknown(err, "注册失败。"));
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    try {
      const auth = await loginUser({ email: loginEmail, password: loginPassword });
      saveSession(auth.token);
      setLoginEmail("");
      setLoginPassword("");
      showSuccess("登录成功", `欢迎回来，${auth.user.displayName}。`);
      const next = await refreshApp(undefined, { token: auth.token });
      router.replace(next?.activeAlbumId ? buildAlbumPath(next.activeAlbumId, "photos") : buildAlbumsPath(queryInviteCode));
    } catch (err) {
      showError("登录失败", errorMessageFromUnknown(err, "登录失败。", {
        unauthorizedMessage: "邮箱或密码不正确，或账号还不存在。"
      }));
    }
  }

  async function handleLogout() {
    const sessionToken = authToken;
    clearSession();
    try {
      if (sessionToken) {
        await logoutUser(sessionToken);
      }
    } catch {
      // Keep local logout deterministic even if the API call fails.
    }
  }

  async function handleCreateAlbum(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken) {
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
      showSuccess("创建成功", "宝宝相册已创建。");
      await refreshApp(album.id);
      router.replace(buildAlbumPath(album.id, "photos"));
    } catch (err) {
      showError("创建失败", errorMessageFromUnknown(err, "创建宝宝相册失败。"));
    }
  }

  async function handleAcceptInvite(code?: string) {
    if (!authToken) {
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
      const accepted = await acceptInvite(authToken, inviteCode, relation);
      setSelectedAlbumId(accepted.albumId);
      window.localStorage.setItem(ALBUM_STORAGE_KEY, accepted.albumId);
      setInviteRelation("");
      showSuccess("加入成功", "你已加入这个宝宝相册。");
      await refreshApp(accepted.albumId);
      router.replace(buildAlbumPath(accepted.albumId, "photos"));
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
    authToken,
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
