/**
 * Integration boot-mode log template — every third-party API wrapper prints a single
 * structured log line at boot indicating LIVE or DISABLED, plus pairs with env-schema
 * hard-fail in production.
 *
 * For background, see:
 *   ~/.claude/skills/production-defensive-patterns/categories/silent-no-op-integrations/
 */

import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Replace with your real third-party SDK
declare class ThirdPartySDK {
  constructor(apiKey: string);
  doStuff(args: { to: string; payload: unknown }): Promise<{ id: string }>;
}

interface IntegrationConfig {
  apiKey: string | undefined;
  // ... other required-for-LIVE config fields
}

@Injectable()
export class ThirdPartyService implements OnModuleInit {
  private readonly logger = new Logger(ThirdPartyService.name);
  private client: ThirdPartySDK | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const cfg: IntegrationConfig = {
      apiKey: this.config.get<string>('THIRD_PARTY_API_KEY'),
    };

    if (!cfg.apiKey) {
      this.logger.warn(
        {
          integration: 'ThirdParty',
          mode: 'DISABLED',
          reason: 'missing THIRD_PARTY_API_KEY',
        },
        'ThirdParty integration: DISABLED — calls will be skipped',
      );
      return;
    }

    this.client = new ThirdPartySDK(cfg.apiKey);
    this.logger.log(
      {
        integration: 'ThirdParty',
        mode: 'LIVE',
        // safe metadata only — never log the API key itself
        keyPrefix: cfg.apiKey.slice(0, 4) + '…',
      },
      'ThirdParty integration: LIVE',
    );
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Best-effort variant — returns `{ delivered: false }` when DISABLED. Use when
   * silent skip is acceptable (notifications, marketing).
   */
  async doStuff(args: { to: string; payload: unknown }): Promise<{ delivered: boolean; id?: string }> {
    if (!this.client) {
      this.logger.warn({ to: args.to }, 'ThirdParty not configured — call skipped');
      return { delivered: false };
    }
    const result = await this.client.doStuff(args);
    return { delivered: true, id: result.id };
  }

  /**
   * Required variant — throws ServiceUnavailableException when DISABLED. Use for
   * security-critical call sites (password reset, payment capture, 2FA).
   */
  async doStuffRequired(args: { to: string; payload: unknown }): Promise<{ id: string }> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'ThirdParty integration not configured — set THIRD_PARTY_API_KEY',
      );
    }
    return await this.client.doStuff(args);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Companion env-schema hard-fail (paste into apps/api/src/config/env.schema.ts):
// ────────────────────────────────────────────────────────────────────────────
//
//   .superRefine((data, ctx) => {
//     // ... other prod-required checks ...
//     if (data.NODE_ENV === 'production' && !data.THIRD_PARTY_API_KEY) {
//       ctx.addIssue({
//         code: z.ZodIssueCode.custom,
//         path: ['THIRD_PARTY_API_KEY'],
//         message:
//           'Required in production — <describe what breaks without it>. Set the ' +
//           'GitHub secret THIRD_PARTY_API_KEY and pass it through deploy.yml.',
//       });
//     }
//   });
