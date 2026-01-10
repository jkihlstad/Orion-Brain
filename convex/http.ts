// convex/http.ts
import { httpRouter } from "convex/server";
import { brainLeaseSpeakerLabelEvents } from "./httpActions/brainLease";
import { brainAckDone, brainAckFailed } from "./httpActions/brainAck";
import { brainCreateLabelSpeakerPrompt } from "./httpActions/brainPrompts";
import { brainListPendingEvents } from "./httpActions/brainSweeper";
import { schedulerContext, writeProposals } from "./httpActions/brain_scheduler";
import { listMeetingInvites, respondToInvite, listSentProposals, updateAvailabilitySettings } from "./httpActions/social";
import { socialContext, writeMeetingProposal as writeMeetingProposalBrain } from "./httpActions/brain_social";

const http = httpRouter();

// Brain endpoints (server-to-server)
http.route({
  path: "/brain/leaseSpeakerLabelEvents",
  method: "POST",
  handler: brainLeaseSpeakerLabelEvents,
});

http.route({
  path: "/brain/ackDone",
  method: "POST",
  handler: brainAckDone,
});

http.route({
  path: "/brain/ackFailed",
  method: "POST",
  handler: brainAckFailed,
});

http.route({
  path: "/brain/createLabelSpeakerPrompt",
  method: "POST",
  handler: brainCreateLabelSpeakerPrompt,
});

http.route({
  path: "/brain/listPendingEvents",
  method: "POST",
  handler: brainListPendingEvents,
});

// Brain Scheduler endpoints
http.route({
  path: "/brain/scheduler/context",
  method: "POST",
  handler: schedulerContext,
});

http.route({
  path: "/brain/scheduler/writeProposals",
  method: "POST",
  handler: writeProposals,
});

// User-facing social endpoints
http.route({ path: "/edge/social/invites/list", method: "GET", handler: listMeetingInvites });
http.route({ path: "/edge/social/invites/respond", method: "POST", handler: respondToInvite });
http.route({ path: "/edge/social/proposals/list", method: "GET", handler: listSentProposals });
http.route({ path: "/edge/social/settings", method: "POST", handler: updateAvailabilitySettings });

// Brain internal social endpoints
http.route({ path: "/brain/social/context", method: "POST", handler: socialContext });
http.route({ path: "/brain/social/writeMeetingProposal", method: "POST", handler: writeMeetingProposalBrain });

export default http;
