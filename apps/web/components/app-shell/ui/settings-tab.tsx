import type { AlbumInvite, AlbumMember, AlbumSummary, AlbumWorkspace, BabyProfile, StorageNode, StorageNodePairing, User } from "../../../lib/types";
import type { AppSessionState } from "../hooks/use-app-session";
import type { SettingsState } from "../hooks/use-settings-state";
import type { StorageStatus } from "../model/types";
import { SettingsAccountScene } from "./settings-account-scene";
import { SettingsAddBabyScene } from "./settings-add-baby-scene";
import { SettingsBabiesScene } from "./settings-babies-scene";
import { SettingsBabyDetailScene } from "./settings-baby-detail-scene";
import { SettingsMemberDetailScene } from "./settings-member-detail-scene";
import { SettingsMenuScene } from "./settings-menu-scene";
import { SettingsStorageScene } from "./settings-storage-scene";

interface SettingsTabProps {
  activeTab: boolean;
  settingsSceneClassName: string;
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  currentUser: User | null;
  albumOptions: AlbumSummary[];
  albumMembers: AlbumMember[];
  albumInvites: AlbumInvite[];
  transferCandidates: AlbumMember[];
  authToken: string;
  session: AppSessionState;
  settings: SettingsState;
  storageNode: StorageNode | null;
  storageStatus: StorageStatus;
  storageStatusSummary: string;
  storageUploadSummary: string;
  storageFlowTitle: string;
  storagePairingModeLabel: string;
  storagePairingActionLabel: string;
  activeStoragePairing: StorageNodePairing | null;
  canManageInvites: boolean;
  canManageBabyProfile: boolean;
  canManageStorage: boolean;
  onAlbumChange: (albumId: string) => void;
  onLogout: () => void;
  onOpenAlbumSettings: (albumId: string) => void | Promise<void>;
}

export function SettingsTab({ activeTab, settingsSceneClassName, activeAlbum, activeBaby, currentUser, albumOptions, albumMembers, albumInvites, transferCandidates, authToken, session, settings, storageNode, storageStatus, storageStatusSummary, storageUploadSummary, storageFlowTitle, storagePairingModeLabel, storagePairingActionLabel, activeStoragePairing, canManageInvites, canManageBabyProfile, canManageStorage, onAlbumChange, onLogout, onOpenAlbumSettings }: SettingsTabProps) {
  return (
    <section aria-hidden={!activeTab} className={`pageStack settingsPage tabSection ${activeTab ? "tabSectionActive" : "tabSectionInactive"}`}>
      {settings.settingsScreen === "menu" ? (
        <SettingsMenuScene
          activeAlbum={activeAlbum}
          activeBaby={activeBaby}
          currentUser={currentUser}
          navDirection={settings.settingsNavDirection}
          onLogout={onLogout}
          onOpenScreen={(screen) => settings.openSettingsScreen(screen)}
          storageStatus={storageStatus}
          storageStatusSummary={storageStatusSummary}
        />
      ) : null}

      {settings.settingsScreen === "account" ? (
        <SettingsAccountScene
          activeAlbum={activeAlbum}
          activeBaby={activeBaby}
          className={settingsSceneClassName}
          currentUser={currentUser}
          onBack={() => settings.openSettingsScreen("menu", "back")}
        />
      ) : null}

      {settings.settingsScreen === "babies" ? (
        <SettingsBabiesScene
          albumOptions={albumOptions}
          authToken={authToken}
          className={settingsSceneClassName}
          onAdd={() => settings.openSettingsScreen("addBaby")}
          onBack={() => settings.openSettingsScreen("menu", "back")}
          onOpenAlbumSettings={onOpenAlbumSettings}
        />
      ) : null}

      {settings.settingsScreen === "addBaby" ? (
        <SettingsAddBabyScene className={settingsSceneClassName} onBack={() => settings.openSettingsScreen("babies", "back")} session={session} />
      ) : null}

      {settings.settingsScreen === "babyDetail" ? (
        <SettingsBabyDetailScene
          activeAlbum={activeAlbum}
          activeBaby={activeBaby}
          albumInvites={albumInvites}
          albumMembers={albumMembers}
          canManageBabyProfile={canManageBabyProfile}
          canManageInvites={canManageInvites}
          className={settingsSceneClassName}
          currentUser={currentUser}
          session={session}
          settings={settings}
          transferCandidates={transferCandidates}
        />
      ) : null}

      {settings.settingsScreen === "memberDetail" ? (
        <SettingsMemberDetailScene
          activeAlbum={activeAlbum}
          albumMembers={albumMembers}
          className={settingsSceneClassName}
          currentUser={currentUser}
          settings={settings}
        />
      ) : null}

      {settings.settingsScreen === "storage" ? (
        <SettingsStorageScene
          activeAlbum={activeAlbum}
          activeBaby={activeBaby}
          activeStoragePairing={activeStoragePairing}
          albumOptions={albumOptions}
          canManageStorage={canManageStorage}
          className={settingsSceneClassName}
          onAlbumChange={onAlbumChange}
          onBack={() => settings.openSettingsScreen("menu", "back")}
          onCreateStoragePairing={settings.handleCreateStoragePairing}
          storageFlowTitle={storageFlowTitle}
          storageNode={storageNode}
          storagePairingActionLabel={storagePairingActionLabel}
          storagePairingModeLabel={storagePairingModeLabel}
          storageStatus={storageStatus}
          storageStatusSummary={storageStatusSummary}
          storageUploadSummary={storageUploadSummary}
        />
      ) : null}
    </section>
  );
}
