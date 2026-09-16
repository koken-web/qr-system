import ManagementHomePage from "./ManagementHomePage";

import "./ManagementEntryPage.css";

type ManagementEntryPageProps = {
  eventConfigured: boolean;
  eventActive: boolean;
  eventName: string;
  onOpenAdmin: () => void;
  onOpenAdminAuth: () => void;
  onBack: () => void;
};

function ManagementEntryPage({
  eventConfigured,
  eventActive: _eventActive,
  eventName,
  onOpenAdmin,
  onOpenAdminAuth: _onOpenAdminAuth,
  onBack,
}: ManagementEntryPageProps) {
  return (
    <ManagementHomePage
      eventConfigured={eventConfigured}
      eventName={eventName}
      onNavigate={onOpenAdmin}
      onReturn={onBack}
    />
  );
}

export default ManagementEntryPage;
