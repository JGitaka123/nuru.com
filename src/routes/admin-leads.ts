/**
 * Admin endpoints for the marketing/outreach engine.
 *
 *   POST   /v1/admin/leads                                  manual lead create
 *   POST   /v1/admin/leads/bulk                             {rows}: bulk import
 *   GET    /v1/admin/leads                                  paginated, filterable
 *   POST   /v1/admin/leads/:id/stage                        force-set stage
 *   GET    /v1/admin/leads/funnel                           counts per stage
 *
 *   POST   /v1/admin/campaigns                              create campaign
 *   POST   /v1/admin/campaigns/:id/active                   {active: bool}
 *   POST   /v1/admin/campaigns/:id/enroll                   queue eligible leads
 *   GET    /v1/admin/campaigns/:id/emails                   list emails
 *   GET    /v1/admin/campaigns/:id/metrics                  open/click/reply rates
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import {
  createLead, bulkImport, listLeads, setLeadStage, leadFunnelMetrics,
  LeadInputSchema,
} from "../services/leads";
import {
  createCampaign, setCampaignActive, enrollLeads,
  listCampaignEmails, campaignMetrics, CampaignInputSchema,
} from "../services/outreach";

const StageEnum = z.enum(["NEW", "ENRICHED", "QUALIFIED", "CONTACTED", "ENGAGED", "ONBOARDED", "REJECTED", "UNSUBSCRIBED", "BOUNCED"]);
const TypeEnum = z.enum(["AUCTIONEER", "BANK", "AGENT_AGENCY", "LANDLORD", "DEVELOPER", "COURT", "OTHER"]);

export async function adminLeadRoutes(app: FastifyInstance) {
  // ------- Leads -------
  app.post(
    "/v1/admin/leads",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const input = LeadInputSchema.parse(req.body);
      const lead = await createLead(input);
      return reply.code(201).send(lead);
    },
  );

  app.post(
    "/v1/admin/leads/bulk",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { rows } = z.object({
        rows: z.array(LeadInputSchema).min(1).max(2000),
      }).parse(req.body);
      const r = await bulkImport(rows);
      return reply.send(r);
    },
  );

  app.get(
    "/v1/admin/leads",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const q = z.object({
        type: TypeEnum.optional(),
        stage: StageEnum.optional(),
        city: z.string().optional(),
        q: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).parse(req.query);
      const r = await listLeads(q);
      return reply.send(r);
    },
  );

  app.post(
    "/v1/admin/leads/:id/stage",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { stage, reason } = z.object({
        stage: StageEnum,
        reason: z.string().max(500).optional(),
      }).parse(req.body);
      const lead = await setLeadStage(id, stage, reason);
      return reply.send(lead);
    },
  );

  app.get(
    "/v1/admin/leads/funnel",
    { preHandler: requireRole("ADMIN") },
    async (_req, reply) => {
      const m = await leadFunnelMetrics();
      return reply.send(m);
    },
  );

  // ------- Campaigns -------
  app.post(
    "/v1/admin/campaigns",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const input = CampaignInputSchema.parse(req.body);
      const c = await createCampaign(input);
      return reply.code(201).send(c);
    },
  );

  app.post(
    "/v1/admin/campaigns/:id/active",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { active } = z.object({ active: z.boolean() }).parse(req.body);
      const c = await setCampaignActive(id, active);
      return reply.send(c);
    },
  );

  app.post(
    "/v1/admin/campaigns/:id/enroll",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const r = await enrollLeads(id);
      return reply.send(r);
    },
  );

  app.get(
    "/v1/admin/campaigns/:id/emails",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const items = await listCampaignEmails(id);
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/admin/campaigns/:id/metrics",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const m = await campaignMetrics(id);
      return reply.send(m);
    },
  );
}
