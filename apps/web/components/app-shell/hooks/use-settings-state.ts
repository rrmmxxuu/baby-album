"use client";

import { useEffect, useState } from "react";
import { createInvite, createStorageNodePairing, leaveAlbum, removeMember, updateBabyProfile, updateMemberRelation, updateMemberRole, uploadBabyAvatar } from "../../../lib/api";
import type { AlbumWorkspace, AppStatePayload, Role, User } from "../../../lib/types";
import { errorMessageFromUnknown } from "../model/feedback";
import { roleLabel, toDateInputValue } from "../model/format";
import type { NavDirection, SettingsScreen, TabKey } from "../model/types";

interface UseSettingsStateOptions {
  activeTab: TabKey;
  activeAlbum: AlbumWorkspace | null;
  currentUser: User | null;
  refreshApp: (targetAlbumId?: string, options?: { silent?: boolean }) => Promise<AppStatePayload | null>;
  clearFeedback: () => void;
  showSuccess: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}

export function useSettingsState({ activeTab, activeAlbum, currentUser, refreshApp, clearFeedback, showSuccess, showWarning, showError }: UseSettingsStateOptions) {
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>("menu");
  const [settingsNavDirection, setSettingsNavDirection] = useState<NavDirection>("forward");
  const [settingsMemberId, setSettingsMemberId] = useState("");
  const [storagePairing, setStoragePairing] = useState<Awaited<ReturnType<typeof createStorageNodePairing>> | null>(null);
  const [storagePairingBaseNodeId, setStoragePairingBaseNodeId] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({});
  const [optimisticRoleOverrides, setOptimisticRoleOverrides] = useState<Record<string, Role>>({});
  const [ownerTransferTarget, setOwnerTransferTarget] = useState("");
  const [babyProfileName, setBabyProfileName] = useState("");
  const [babyProfileBirthDate, setBabyProfileBirthDate] = useState("");
  const [babyAvatarFile, setBabyAvatarFile] = useState<File | null>(null);
  const [myRelationDraft, setMyRelationDraft] = useState("");

  useEffect(() => {
    const members = activeAlbum?.members ?? [];
    const drafts: Record<string, Role> = {};
    const serverRoles = new Map<string, Role>();
    for (const member of members) {
      drafts[member.userId] = member.role;
      serverRoles.set(member.userId, member.role);
    }
    setRoleDrafts(drafts);
    setOptimisticRoleOverrides((current) => {
      const next: Record<string, Role> = {};
      for (const [memberUserId, optimisticRole] of Object.entries(current)) {
        const serverRole = serverRoles.get(memberUserId);
        if (serverRole && serverRole !== optimisticRole) {
          next[memberUserId] = optimisticRole;
        }
      }
      return next;
    });
    setBabyProfileName(activeAlbum?.baby?.name ?? "");
    setBabyProfileBirthDate(activeAlbum?.baby?.birthDate ? toDateInputValue(activeAlbum.baby.birthDate) : "");
    setMyRelationDraft(activeAlbum?.membership.relation ?? "");
    setBabyAvatarFile(null);
  }, [activeAlbum]);

  useEffect(() => {
    if (activeTab !== "settings") {
      setSettingsNavDirection("forward");
      setSettingsScreen("menu");
      setSettingsMemberId("");
    }
  }, [activeTab]);

  useEffect(() => {
    if (!storagePairing || !activeAlbum || storagePairing.albumId !== activeAlbum.album.id) {
      return;
    }

    const targetAlbum = activeAlbum;
    let cancelled = false;
    async function pollStoragePairing() {
      const next = await refreshApp(targetAlbum.album.id, { silent: true });
      const nextStorageNode = next?.activeAlbum?.storageNode ?? null;
      const pairingCompleted = nextStorageNode && (!storagePairingBaseNodeId || nextStorageNode.id !== storagePairingBaseNodeId);
      if (!cancelled && pairingCompleted) {
        setStoragePairing(null);
        setStoragePairingBaseNodeId("");
        showSuccess(
          targetAlbum.storageNode ? "新主节点已接入" : "储存节点已接入",
          targetAlbum.storageNode ? "新设备已完成配对，页面已自动切换到当前主节点状态。" : "储存设备已完成配对，上传入口现在可以直接使用。"
        );
      }
    }

    void pollStoragePairing();
    const interval = window.setInterval(() => {
      void pollStoragePairing();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeAlbum, refreshApp, showSuccess, storagePairing, storagePairingBaseNodeId]);

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

  async function handleUpdateBabyProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAlbum?.baby) {
      return;
    }
    clearFeedback();
    try {
      await updateBabyProfile(activeAlbum.album.id, activeAlbum.baby.id, {
        name: babyProfileName.trim(),
        birthDate: babyProfileBirthDate ? new Date(`${babyProfileBirthDate}T00:00:00Z`).toISOString() : undefined
      });
      if (babyAvatarFile) {
        await uploadBabyAvatar(activeAlbum.album.id, activeAlbum.baby.id, babyAvatarFile);
        setBabyAvatarFile(null);
      }
      showSuccess("保存成功", "宝宝信息已更新。");
      await refreshApp(activeAlbum.album.id);
    } catch (err) {
      showError("保存失败", errorMessageFromUnknown(err, "更新宝宝信息失败。"));
    }
  }

  async function handleRoleUpdate(memberUserId: string, explicitRole?: Role) {
    if (!activeAlbum) {
      return;
    }
    clearFeedback();
    const nextRole = explicitRole ?? roleDrafts[memberUserId];
    if (!nextRole) {
      showWarning("未选择权限", "请先选择要保存的权限。");
      return;
    }
    setOptimisticRoleOverrides((current) => ({ ...current, [memberUserId]: nextRole }));
    try {
      await updateMemberRole(activeAlbum.album.id, memberUserId, nextRole);
      showSuccess("权限已更新", `已更新成员权限：${roleLabel(nextRole)}。`);
      await refreshApp(activeAlbum.album.id);
    } catch (err) {
      setOptimisticRoleOverrides((current) => {
        const next = { ...current };
        delete next[memberUserId];
        return next;
      });
      showError("更新失败", errorMessageFromUnknown(err, "更新成员权限失败。"));
    }
  }

  async function handleRemoveMember(memberUserId: string) {
    if (!activeAlbum) {
      return false;
    }
    clearFeedback();
    try {
      await removeMember(activeAlbum.album.id, memberUserId);
      showSuccess("成员已移除", "该成员已从当前宝宝相册中移除。");
      await refreshApp(activeAlbum.album.id);
      return true;
    } catch (err) {
      showError("移除失败", errorMessageFromUnknown(err, "移除成员失败。"));
      return false;
    }
  }

  async function handleUpdateMyRelation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAlbum || !currentUser) {
      return;
    }
    const relation = myRelationDraft.trim();
    if (!relation) {
      showWarning("请补充信息", "请先填写你与宝宝的关系。");
      return;
    }
    clearFeedback();
    try {
      await updateMemberRelation(activeAlbum.album.id, currentUser.id, relation);
      showSuccess("保存成功", "关系称呼已更新。");
      await refreshApp(activeAlbum.album.id);
    } catch (err) {
      showError("更新失败", errorMessageFromUnknown(err, "更新关系称呼失败。"));
    }
  }

  async function handleLeaveAlbum() {
    if (!activeAlbum) {
      return;
    }
    clearFeedback();
    try {
      await leaveAlbum(activeAlbum.album.id, ownerTransferTarget || undefined);
      setOwnerTransferTarget("");
      showSuccess("已退出相册", "你已退出当前宝宝相册。");
      await refreshApp();
    } catch (err) {
      showError("退出失败", errorMessageFromUnknown(err, "退出相册失败。"));
    }
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAlbum) {
      return;
    }
    clearFeedback();
    try {
      const created = await createInvite(activeAlbum.album.id);
      showSuccess("邀请码已生成", `已生成邀请码：${created.code}`);
      await refreshApp(activeAlbum.album.id);
    } catch (err) {
      showError("生成失败", errorMessageFromUnknown(err, "创建邀请码失败。"));
    }
  }

  async function handleCreateStoragePairing() {
    if (!activeAlbum) {
      return;
    }
    clearFeedback();
    try {
      const pairing = await createStorageNodePairing(activeAlbum.album.id);
      setStoragePairing(pairing);
      setStoragePairingBaseNodeId(activeAlbum.storageNode?.id ?? "");
      showSuccess(
        activeAlbum.storageNode ? "替换配对码已生成" : "储存节点配对码已生成",
        activeAlbum.storageNode ? "已生成替换配对码。新设备接入后会切换为当前主节点。" : "已生成储存节点配对码。请在 24 小时内用于首次部署 agent。"
      );
    } catch (err) {
      showError("生成失败", errorMessageFromUnknown(err, "生成储存节点配对码失败。"));
    }
  }

  return {
    settingsScreen,
    settingsNavDirection,
    settingsMemberId,
    openSettingsScreen,
    storagePairing,
    roleDrafts,
    optimisticRoleOverrides,
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
    handleUpdateBabyProfile,
    handleRoleUpdate,
    handleUpdateMyRelation,
    handleRemoveMember,
    handleLeaveAlbum,
    handleCreateInvite,
    handleCreateStoragePairing
  };
}

export type SettingsState = ReturnType<typeof useSettingsState>;
