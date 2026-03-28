"use client";

import { useEffect, useState } from "react";
import { createInvite, createStorageNodePairing, leaveAlbum, updateBabyProfile, updateMemberRelation, updateMemberRole, uploadBabyAvatar } from "../../../lib/api";
import type { AlbumWorkspace, AppStatePayload, Role, User } from "../../../lib/types";
import { roleLabel, toDateInputValue } from "../model/format";
import type { NavDirection, SettingsScreen, TabKey } from "../model/types";

interface UseSettingsStateOptions {
  activeTab: TabKey;
  authToken: string;
  appState: AppStatePayload | null;
  activeAlbum: AlbumWorkspace | null;
  currentUser: User | null;
  refreshApp: (targetAlbumId?: string, options?: { silent?: boolean }) => Promise<void>;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
}

export function useSettingsState({ activeTab, authToken, appState, activeAlbum, currentUser, refreshApp, setError, setNotice }: UseSettingsStateOptions) {
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>("menu");
  const [settingsNavDirection, setSettingsNavDirection] = useState<NavDirection>("forward");
  const [settingsMemberId, setSettingsMemberId] = useState("");
  const [storagePairing, setStoragePairing] = useState<Awaited<ReturnType<typeof createStorageNodePairing>> | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({});
  const [ownerTransferTarget, setOwnerTransferTarget] = useState("");
  const [babyProfileName, setBabyProfileName] = useState("");
  const [babyProfileBirthDate, setBabyProfileBirthDate] = useState("");
  const [babyAvatarFile, setBabyAvatarFile] = useState<File | null>(null);
  const [myRelationDraft, setMyRelationDraft] = useState("");

  useEffect(() => {
    const members = appState?.activeAlbum?.members ?? [];
    const drafts: Record<string, Role> = {};
    for (const member of members) {
      drafts[member.userId] = member.role;
    }
    setRoleDrafts(drafts);
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

  function setRoleDraft(memberUserId: string, role: Role) {
    setRoleDrafts((current) => ({ ...current, [memberUserId]: role }));
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
    if (!authToken || !activeAlbum) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const nextRole = roleDrafts[memberUserId];
      await updateMemberRole(authToken, activeAlbum.album.id, memberUserId, nextRole);
      setNotice(`已更新成员权限：${roleLabel(nextRole)}。`);
      await refreshApp(activeAlbum.album.id);
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
    if (!authToken || !activeAlbum) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await leaveAlbum(authToken, activeAlbum.album.id, ownerTransferTarget || undefined);
      setOwnerTransferTarget("");
      setNotice("你已退出当前宝宝相册。");
      await refreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出相册失败。");
    }
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken || !activeAlbum) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const created = await createInvite(authToken, activeAlbum.album.id);
      setNotice(`已生成邀请码：${created.code}`);
      await refreshApp(activeAlbum.album.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建邀请码失败。");
    }
  }

  async function handleCreateStoragePairing() {
    if (!authToken || !activeAlbum) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const pairing = await createStorageNodePairing(authToken, activeAlbum.album.id);
      setStoragePairing(pairing);
      setNotice(activeAlbum.storageNode ? "已生成替换配对码。新设备接入后会切换为当前主节点。" : "已生成储存节点配对码。请在 24 小时内用于首次部署 agent。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成储存节点配对码失败。");
    }
  }

  return {
    settingsScreen,
    settingsNavDirection,
    settingsMemberId,
    openSettingsScreen,
    storagePairing,
    roleDrafts,
    setRoleDraft,
    ownerTransferTarget,
    setOwnerTransferTarget,
    babyProfileName,
    setBabyProfileName,
    babyProfileBirthDate,
    setBabyProfileBirthDate,
    babyAvatarFile,
    setBabyAvatarFile,
    myRelationDraft,
    setMyRelationDraft,
    handleOpenAlbumSettings,
    handleUpdateBabyProfile,
    handleRoleUpdate,
    handleUpdateMyRelation,
    handleLeaveAlbum,
    handleCreateInvite,
    handleCreateStoragePairing
  };
}

export type SettingsState = ReturnType<typeof useSettingsState>;
