"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { acceptInvite, createAlbum, loadAppState, loginUser, logoutUser, registerUser, uploadBabyAvatar } from "../../../lib/api";
import type { AppStatePayload } from "../../../lib/types";
import { ALBUM_STORAGE_KEY, BOOT_SPLASH_EXIT_MS, BOOT_SPLASH_MIN_MS, TOKEN_STORAGE_KEY } from "../model/constants";
import type { AuthMode } from "../model/types";

interface RefreshOptions {
  silent?: boolean;
  token?: string;
}

export function useAppSession(queryInviteCode: string) {
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
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const clearSession = useCallback((showNotice = true) => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ALBUM_STORAGE_KEY);
    setAuthToken("");
    setSelectedAlbumId("");
    setAppState(null);
    if (showNotice) {
      setNotice("已退出登录。");
    }
  }, []);

  const refreshApp = useCallback(async (targetAlbumId?: string, options?: RefreshOptions) => {
    const sessionToken = options?.token ?? authToken;
    if (!sessionToken) {
      return;
    }
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载数据失败。";
      setError(message);
      if (message.includes("unauthorized")) {
        clearSession(false);
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [authToken, clearSession]);

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
    setError(null);
    setNotice(null);
    try {
      const auth = await registerUser({ displayName: registerName, email: registerEmail, password: registerPassword });
      saveSession(auth.token);
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setNotice(`欢迎，${auth.user.displayName}。请继续加入已有相册，或创建第一个宝宝相册。`);
      await refreshApp(undefined, { token: auth.token });
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
      await refreshApp(undefined, { token: auth.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败。");
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
      await refreshApp(accepted.albumId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入相册失败。");
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
    notice,
    setNotice,
    error,
    setError,
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
