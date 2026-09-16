import ManagementHomePage from "./ManagementHomePage";

import "./ManagementEntryPage.css";

type ManagementEntryPageProps = {
  eventConfigured: boolean;
  eventName: string;
  onNavigate: (page: string) => void;
  onReturn: () => void;
};

function ManagementEntryPage({
  eventConfigured,
  eventName,
  onNavigate,
  onReturn,
}: ManagementEntryPageProps) {
  return (
    <ManagementHomePage
      eventConfigured={eventConfigured}
      eventName={eventName}
      onNavigate={onNavigate}
      onReturn={onReturn}
    />
  );
}

export default ManagementEntryPage;
