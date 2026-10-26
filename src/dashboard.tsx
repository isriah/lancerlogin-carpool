// Carpool's dashboard contribution. It imports only the module SDK, React and Leaflet; the composed dashboard provides
// one shared copy of each. Core renders every page, setup screen and slot inside the module root that scopes carpool.css.
import "./carpool.css";
import { defineDashboardModule, type DashboardPageContext } from "@lancerlogin/module-sdk/dashboard";
import { CarpoolWorkspace } from "./dashboard/carpool-workspace";
import { CarpoolSettings } from "./dashboard/carpool-settings";
import { CarpoolSetupWorkspace } from "./dashboard/carpool-setup-workspace";
import { CarpoolMeetingBadge, CarpoolMeetingPanel, useCarpoolMeetingLinks } from "./dashboard/carpool-meeting-links";

function workspace({ navigate, params }: DashboardPageContext) {
  return <CarpoolWorkspace planId={params.planId} onOpenPlan={(id) => navigate(`/carpool/plans/${encodeURIComponent(id)}`)} onOpenMeeting={(id) => navigate(`/meetings/${encodeURIComponent(id)}`)} />;
}

const dashboard = defineDashboardModule({
  moduleId: "carpool",
  routes: [
    { path: "/carpool", render: workspace, wide: true },
    { path: "/carpool/plans/:planId+", render: workspace, wide: true },
  ],
  settingsPages: [{ path: "/settings/carpool", render: () => <CarpoolSettings /> }],
  setup: CarpoolSetupWorkspace,
  slotData: {
    // One request per loaded meeting collection or meeting; badges and the panel filter the shared result.
    "attendance.meeting-collection": ({ meetings }) => useCarpoolMeetingLinks(meetings),
    "attendance.meeting-workspace": ({ meeting }) => useCarpoolMeetingLinks(meeting),
  },
  slots: {
    "attendance.calendar-meeting-badge": CarpoolMeetingBadge,
    "attendance.meeting-directory-badge": CarpoolMeetingBadge,
    "attendance.meeting-detail-panel": CarpoolMeetingPanel,
  },
});

export default dashboard;
