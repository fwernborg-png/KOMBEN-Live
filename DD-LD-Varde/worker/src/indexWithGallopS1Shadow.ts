import baseWorker from "./index";

import {
  runGallopS1ShadowCycle,
} from "./gallopS1ShadowV1";

type WorkerEnv =
  Parameters<
    typeof baseWorker.fetch
  >[1];

export default {
  async scheduled(
    controller:
      ScheduledController,
    env:
      WorkerEnv,
    ctx:
      ExecutionContext,
  ) {
    /*
     * Ordinarie Worker kör exakt som tidigare.
     * Den nya galoppmodellen ligger parallellt
     * och kan aldrig stoppa huvudcronens flöde.
     */
    await baseWorker.scheduled(
      controller,
      env,
      ctx,
    );

    ctx.waitUntil(
      runGallopS1ShadowCycle(
        env,
      )
        .then(
          (summary) => {
            if (
              summary
                .evaluationsCreated >
                  0 ||
              summary
                .betsCreated >
                  0 ||
              summary
                .betsSettled >
                  0 ||
              summary
                .betsVoided >
                  0
            ) {
              console.log(
                "[GALLOP S1 SHADOW]",
                JSON.stringify(
                  summary,
                ),
              );
            }
          },
        )
        .catch(
          (error) => {
            /*
             * Shadowfel loggas separat.
             * Trav, T90, T1 och research får
             * fortsätta även om modellen skulle
             * få ett eget tillfälligt fel.
             */
            console.error(
              "[GALLOP S1 SHADOW] failed",
              error instanceof Error
                ? error.message
                : String(error),
            );
          },
        ),
    );
  },

  async fetch(
    request: Request,
    env: WorkerEnv,
  ) {
    return baseWorker.fetch(
      request,
      env,
    );
  },
};
