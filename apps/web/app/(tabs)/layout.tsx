import { TabsWorkspaceLayout } from "../../components/app-shell/ui/tabs-workspace-layout";

interface TabsLayoutProps {
  children: React.ReactNode;
  photos: React.ReactNode;
  feeding: React.ReactNode;
  settings: React.ReactNode;
}

export default function TabsLayout({ children, feeding, photos, settings }: TabsLayoutProps) {
  return (
    <TabsWorkspaceLayout feeding={feeding} photos={photos} settings={settings}>
      {children}
    </TabsWorkspaceLayout>
  );
}

