"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UploadComposer } from "./upload-composer";
import { acceptInvite, createBaby, createFamily, createInvite, getApiBaseUrl, getPreviewUrl, loadAppState, loadInvite, loginUser, logoutUser, registerUser, updateMemberRole } from "../lib/api";
import type { AppStatePayload, FamilyInvite, FamilyMember, MediaAsset, Role } from "../lib/types";

type TabKey = "photos" | "upload" | "settings";

const TOKEN_STORAGE_KEY = "baby-album.authToken";
const FAMILY_STORAGE_KEY = "baby-album.familyId";

function AppShellInner() {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite") ?? "";
  const apiBaseUrl = getApiBaseUrl();

  const [origin, setOrigin] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("photos");
  const [authToken, setAuthToken] = useState("");
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [appState, setAppState] = useState<AppStatePayload | null>(null);
  const [invite, setInvite] = useState<FamilyInvite | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [familyTimezone, setFamilyTimezone] = useState("Asia/Shanghai");
  const [babyName, setBabyName] = useState("");
  const [babyBirthDate, setBabyBirthDate] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");

  useEffect(() => {
    setHydrated(true);
    setOrigin(window.location.origin);
    setAuthToken(window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
    setSelectedFamilyId(window.localStorage.getItem(FAMILY_STORAGE_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (!inviteCode) {
      setInvite(null);
      return;
    }
    let cancelled = false;
    loadInvite(inviteCode)
      .then((value) => {
        if (!cancelled) {
          setInvite(value);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

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
      setActiveTab("settings");
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
      const message = err instanceof Error ? err.message : "Failed to load app state.";
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
    setActiveTab("settings");
    if (showNotice) {
      setNotice("Local session cleared.");
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
      setNotice(`Signed in as ${auth.user.displayName}.`);
      setActiveTab("settings");
      await refreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
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
      setNotice(`Signed in as ${auth.user.displayName}.`);
      await refreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    }
  }

  async function handleLogout() {
    try {
      if (authToken) {
        await logoutUser(authToken);
      }
    } catch {
      // Keep local logout deterministic even if server session cleanup fails.
    }
    clearSession();
  }

  async function handleCreateFamily(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const family = await createFamily(authToken, { name: familyName, timezone: familyTimezone });
      setFamilyName("");
      setSelectedFamilyId(family.id);
      window.localStorage.setItem(FAMILY_STORAGE_KEY, family.id);
      setNotice(`Created family ${family.name}.`);
      await refreshApp(family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create family.");
    }
  }

  async function handleCreateBaby(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken || !appState?.activeFamily) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await createBaby(authToken, appState.activeFamily.family.id, {
        name: babyName,
        birthDate: babyBirthDate ? new Date(`${babyBirthDate}T00:00:00Z`).toISOString() : undefined
      });
      setBabyName("");
      setBabyBirthDate("");
      setNotice("Baby profile created.");
      await refreshApp(appState.activeFamily.family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create baby profile.");
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
      setNotice(`Invite created for role ${created.role}.`);
      await refreshApp(appState.activeFamily.family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite.");
    }
  }

  async function handleAcceptInvite() {
    if (!authToken || !inviteCode) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const accepted = await acceptInvite(authToken, inviteCode);
      setSelectedFamilyId(accepted.familyId);
      window.localStorage.setItem(FAMILY_STORAGE_KEY, accepted.familyId);
      setNotice(`Joined ${accepted.familyName ?? "family"} as ${accepted.role}.`);
      await refreshApp(accepted.familyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite.");
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
      setNotice(`Updated role for ${memberUserId} to ${nextRole}.`);
      await refreshApp(appState.activeFamily.family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role.");
    }
  }

  const activeFamily = appState?.activeFamily ?? null;
  const currentUser = appState?.currentUser ?? null;
  const isOwner = activeFamily?.membership.role === "owner";
  const canManageInvites = activeFamily?.membership.role === "owner" || activeFamily?.membership.role === "admin";
  const timelineGroups = groupTimeline(activeFamily?.timeline ?? []);

  return (
    <main className="appShell">
      <section className="topBar panel">
        <div>
          <p className="eyebrow">宝宝相册</p>
          <h1>Baby Album</h1>
          <p className="helperText">Self-hosted family photo timeline with real login, invitations, uploads, and family RBAC.</p>
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
        <section className="gridColumns">
          <article className="panelStack panel">
            <div className="sectionHeading">
              <div>
                <p className="eyebrow">Register</p>
                <h2>Create account</h2>
              </div>
            </div>
            <form className="formGrid" onSubmit={handleRegister}>
              <label>
                Display name
                <input value={registerName} onChange={(event) => setRegisterName(event.target.value)} />
              </label>
              <label>
                Email
                <input type="email" value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} />
              </label>
              <label>
                Password
                <input type="password" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} />
              </label>
              <button type="submit">Create account</button>
            </form>
          </article>

          <article className="panelStack panel">
            <div className="sectionHeading">
              <div>
                <p className="eyebrow">Login</p>
                <h2>Sign in</h2>
              </div>
            </div>
            <form className="formGrid" onSubmit={handleLogin}>
              <label>
                Email
                <input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
              </label>
              <label>
                Password
                <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
              </label>
              <button type="submit">Sign in</button>
            </form>
            <p className="helperText">Demo seeded accounts use password <code>demo12345</code>.</p>
            {invite ? <InviteCard invite={invite} origin={origin} mode="preview" /> : null}
          </article>
        </section>
      ) : null}

      {authToken && !activeFamily && !loading ? (
        <section className="gridColumns">
          <article className="panelStack panel">
            <div className="sectionHeading">
              <div>
                <p className="eyebrow">Family Setup</p>
                <h2>Create your first family</h2>
              </div>
            </div>
            <form className="formGrid" onSubmit={handleCreateFamily}>
              <label>
                Family name
                <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
              </label>
              <label>
                Timezone
                <input value={familyTimezone} onChange={(event) => setFamilyTimezone(event.target.value)} />
              </label>
              <button type="submit">Create family</button>
            </form>
          </article>
          <article className="panelStack panel">
            <div className="sectionHeading">
              <div>
                <p className="eyebrow">Invite Link</p>
                <h2>Join an existing family</h2>
              </div>
            </div>
            {invite ? (
              <>
                <InviteCard invite={invite} origin={origin} mode="accept" />
                <button onClick={handleAcceptInvite} type="button">Accept invite</button>
              </>
            ) : (
              <p className="helperText">Open an invite link with the <code>?invite=CODE</code> query parameter to join a family.</p>
            )}
          </article>
        </section>
      ) : null}

      {authToken && activeFamily ? (
        <>
          <section className="summaryGrid">
            <article className="metricCard panel"><span>Active family</span><strong>{activeFamily.family.name}</strong></article>
            <article className="metricCard panel"><span>Your role</span><strong>{activeFamily.membership.role}</strong></article>
            <article className="metricCard panel"><span>Babies</span><strong>{activeFamily.babies.length}</strong></article>
            <article className="metricCard panel"><span>Media</span><strong>{activeFamily.timeline.length}</strong></article>
          </section>

          {activeTab === "photos" ? (
            <section className="pageStack">
              <article className="panelStack panel">
                <div className="sectionHeading">
                  <div>
                    <p className="eyebrow">Photos</p>
                    <h2>Captured-date timeline</h2>
                  </div>
                  <span className="pill">{activeFamily.timeline.length} items</span>
                </div>
                <div className="tagRow">
                  {activeFamily.babies.map((baby) => (
                    <span className="tag" key={baby.id}>{baby.name}{baby.birthDate ? ` / ${formatDate(baby.birthDate)}` : ""}</span>
                  ))}
                </div>
                <div className="timelineGroups">
                  {timelineGroups.length === 0 ? <p className="helperText">No media yet. Switch to Upload to add the first photo.</p> : timelineGroups.map(([day, items]) => (
                    <article className="timelineDay" key={day}>
                      <header><h3>{day}</h3><p>{items.length} items</p></header>
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
                    <p className="eyebrow">Storage Node</p>
                    <h2>{activeFamily.storageNode ? activeFamily.storageNode.name : "No NAS connected"}</h2>
                  </div>
                  <span className={`pill ${activeFamily.storageNode?.status === "online" ? "pillOnline" : ""}`}>{activeFamily.storageNode?.status ?? "offline"}</span>
                </div>
                {activeFamily.storageNode ? <p className="helperText">Last heartbeat: {formatDateTime(activeFamily.storageNode.lastSeenAt)}</p> : <p className="helperText">Uploads stay disabled until this family is paired with a NAS agent.</p>}
              </article>
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className="pageStack">
              <div className="gridColumns">
                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">Session</p><h2>Current user</h2></div></div>
                  <p><strong>{currentUser?.displayName}</strong></p>
                  <p className="helperText">{currentUser?.email}</p>
                  <p className="helperText">Family role: {activeFamily.membership.role}</p>
                  <button className="secondaryButton" onClick={handleLogout} type="button">Sign out</button>
                </article>
                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">Families</p><h2>Switch or create</h2></div></div>
                  <label>
                    Active family
                    <select value={selectedFamilyId} onChange={(event) => setSelectedFamilyId(event.target.value)}>
                      {(appState?.families ?? []).map((entry) => <option key={entry.family.id} value={entry.family.id}>{entry.family.name} / {entry.membership.role}</option>)}
                    </select>
                  </label>
                  <form className="formGrid compactForm" onSubmit={handleCreateFamily}>
                    <label>
                      New family name
                      <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
                    </label>
                    <label>
                      Timezone
                      <input value={familyTimezone} onChange={(event) => setFamilyTimezone(event.target.value)} />
                    </label>
                    <button type="submit">Create another family</button>
                  </form>
                </article>
              </div>

              {invite ? (
                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">Invite</p><h2>Pending invite link</h2></div></div>
                  <InviteCard invite={invite} origin={origin} mode="accept" />
                  {invite.status === "pending" ? <button onClick={handleAcceptInvite} type="button">Accept invite</button> : null}
                </article>
              ) : null}

              <div className="gridColumns">
                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">Baby Profiles</p><h2>Children in this family</h2></div></div>
                  <div className="stackList">
                    {activeFamily.babies.map((baby) => (
                      <div className="listRow" key={baby.id}><div><strong>{baby.name}</strong><p className="helperText">{baby.birthDate ? formatDate(baby.birthDate) : "Birth date not set"}</p></div></div>
                    ))}
                  </div>
                  <form className="formGrid compactForm" onSubmit={handleCreateBaby}>
                    <label>
                      Baby name
                      <input value={babyName} onChange={(event) => setBabyName(event.target.value)} />
                    </label>
                    <label>
                      Birth date
                      <input type="date" value={babyBirthDate} onChange={(event) => setBabyBirthDate(event.target.value)} />
                    </label>
                    <button type="submit">Create baby profile</button>
                  </form>
                </article>

                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">Member Roles</p><h2>RBAC management</h2></div></div>
                  <div className="stackList">
                    {activeFamily.members.map((member) => (
                      <MemberRow canEdit={Boolean(isOwner && currentUser && member.userId !== currentUser.id && member.role !== "owner")} draftRole={roleDrafts[member.userId] ?? member.role} key={member.userId} member={member} onChange={(role) => setRoleDrafts((current) => ({ ...current, [member.userId]: role }))} onSave={() => void handleRoleUpdate(member.userId)} />
                    ))}
                  </div>
                </article>
              </div>

              {canManageInvites ? (
                <article className="panelStack panel">
                  <div className="sectionHeading"><div><p className="eyebrow">Invite Links</p><h2>Create and share access</h2></div></div>
                  <form className="inlineForm" onSubmit={handleCreateInvite}>
                    <label>
                      Role
                      <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
                        <option value="viewer">viewer</option>
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                    </label>
                    <button type="submit">Generate invite link</button>
                  </form>
                  <div className="stackList">
                    {activeFamily.invites.length === 0 ? <p className="helperText">No invite links yet.</p> : null}
                    {activeFamily.invites.map((item) => <InviteCard invite={item} key={item.id} mode="manage" origin={origin} />)}
                  </div>
                </article>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {loading ? <p className="helperText loadingRow">Syncing latest family state...</p> : null}

      <nav className="bottomNav">
        <button className={activeTab === "photos" ? "navActive" : ""} onClick={() => setActiveTab("photos")} type="button">Photos</button>
        <button className={activeTab === "upload" ? "navActive" : ""} onClick={() => setActiveTab("upload")} type="button">Upload</button>
        <button className={activeTab === "settings" ? "navActive" : ""} onClick={() => setActiveTab("settings")} type="button">Settings</button>
      </nav>
    </main>
  );
}

function TimelineItem({ authToken, familyId, item }: { authToken: string; familyId: string; item: MediaAsset }) {
  const previewUrl = getPreviewUrl(item.id, familyId, authToken);
  const dimensions = item.width > 0 && item.height > 0 ? `${item.width} x ${item.height}` : "Size pending";
  return (
    <div className="timelineItem">
      <div className="thumb">
        {item.previewStatus === "ready" ? <img alt={item.fileName} className="thumbImage" loading="lazy" src={previewUrl} /> : <div className="thumbFallback">{item.mediaType.startsWith("video") ? "VIDEO" : "PHOTO"}</div>}
      </div>
      <div className="timelineCopy">
        <strong>{item.fileName}</strong>
        <p>{formatDateTime(item.capturedAt)}</p>
        <p className="helperText">{item.status} / {item.source} / {item.previewStatus} / {dimensions}</p>
      </div>
    </div>
  );
}

function MemberRow({ canEdit, draftRole, member, onChange, onSave }: { canEdit: boolean; draftRole: Role; member: FamilyMember; onChange: (role: Role) => void; onSave: () => void }) {
  return (
    <div className="memberRow">
      <div>
        <strong>{member.displayName}</strong>
        <p className="helperText">{member.userId}</p>
      </div>
      {canEdit ? (
        <div className="memberActions">
          <select value={draftRole} onChange={(event) => onChange(event.target.value as Role)}>
            <option value="viewer">viewer</option>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button onClick={onSave} type="button">Save</button>
        </div>
      ) : (
        <span className="pill">{member.role}</span>
      )}
    </div>
  );
}

function InviteCard({ invite, mode, origin }: { invite: FamilyInvite; mode: "preview" | "accept" | "manage"; origin: string }) {
  const inviteLink = origin ? `${origin}/?invite=${invite.code}` : `/?invite=${invite.code}`;
  return (
    <div className="inviteCard">
      <strong>{invite.familyName ?? "Family invite"}</strong>
      <p className="helperText">Role: {invite.role} / Status: {invite.status}</p>
      <p className="helperText">Created by {invite.createdByName ?? invite.createdBy}</p>
      {mode !== "preview" ? <p className="inviteLink">{inviteLink}</p> : null}
      {mode === "preview" ? <p className="helperText">Finish registration or sign in, then accept this invite to join {invite.familyName ?? "the family"}.</p> : null}
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function AppShell() {
  return (
    <Suspense fallback={<main className="appShell"><section className="panel"><p className="helperText">Loading app shell...</p></section></main>}>
      <AppShellInner />
    </Suspense>
  );
}