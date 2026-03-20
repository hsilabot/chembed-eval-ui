import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Expert Review Guide',
  description: 'Instructions and rubric for expert review of ChEmbed retrieval data',
}

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Expert Review Guide</h1>
          <p className="max-w-3xl text-sm leading-6 text-neutral-300">
            This guide explains what the review tasks mean and how to interpret the rating fields.
            The goal is to make expert feedback more consistent and easier to compare across items.
          </p>
        </header>

        <section className="space-y-3 rounded border border-neutral-800 bg-neutral-900/60 p-5">
          <h2 className="text-lg font-semibold">1. Project overview</h2>
          <div className="space-y-3 text-sm leading-6 text-neutral-200">
            <p>
              We are building a chemistry-specialized embedding model trained on chemistry literature and
              article text.
            </p>
            <p>
              Embedding models are not generative models such as ChatGPT. They do not write answers or hold
              a conversation. Instead, they help measure which pieces of text are semantically similar to each
              other. You can think of them as part of the core matching system behind a search engine. Given a
              user query and a collection of passages, the embedding model helps identify which passages are
              most likely to match the query and contain the answer.
            </p>
            <p>
              To train models like this, we need paired data such as query-passage or question-paragraph
              examples. In the chemistry domain, this kind of data was not readily available at the scale we
              needed. To build it, we first collected chemistry-related text from article sources such as
              ChemRxiv and Semantic Scholar, then split those documents into paragraphs. We then used large
              language models to generate synthetic queries for those paragraphs, with the goal of mimicking
              realistic human search behavior, meaning what a user might type when looking for a passage whose
              answer or information is contained in that paragraph.
            </p>
            <p>
              When reviewing, try to think like a knowledgeable human using a search engine to find the right
              chemistry passage.
            </p>
          </div>
        </section>

        <section className="space-y-3 rounded border border-neutral-800 bg-neutral-900/60 p-5">
          <h2 className="text-lg font-semibold">2. Training data (Task A): synthetic query quality</h2>
          <div className="space-y-3 text-sm leading-6 text-neutral-200">
            <p>In Task A, you will see:</p>
            <ul className="list-disc space-y-1 pl-5 text-neutral-300">
              <li>a generated query</li>
              <li>the source passage from which the query was generated</li>
            </ul>
            <p>Your job is to judge whether the query:</p>
            <ul className="list-disc space-y-1 pl-5 text-neutral-300">
              <li>can be answered from the passage</li>
              <li>is specific to the passage and its context</li>
              <li>is clear and understandable on its own</li>
              <li>is scientifically faithful to the passage</li>
              <li>feels like a realistic query a human might search for</li>
            </ul>
            <p>
              Intuition: imagine a human wants to find this passage through a search engine. Does this query
              look like something that person might realistically type?
            </p>
          </div>
        </section>

        <section className="space-y-3 rounded border border-neutral-800 bg-neutral-900/60 p-5">
          <h2 className="text-lg font-semibold">3. Evaluation data (Task B): retrieval quality</h2>
          <div className="space-y-3 text-sm leading-6 text-neutral-200">
            <p>In Task B, you will see:</p>
            <ul className="list-disc space-y-1 pl-5 text-neutral-300">
              <li>a generated query</li>
              <li>the gold/source passage</li>
              <li>the top-10 passages retrieved by the model</li>
            </ul>
            <p>As in Task A, consider whether the query is understandable, realistic, and scientifically faithful.</p>
            <p>In addition, judge how useful the retrieval results are for satisfying the query.</p>
            <p>There are two categories:</p>
            <ul className="list-disc space-y-1 pl-5 text-neutral-300">
              <li>
                <span className="font-medium text-white">Successful:</span> the gold passage appears somewhere in
                the top-10 retrieved passages.
              </li>
              <li>
                <span className="font-medium text-white">Unsuccessful:</span> the gold passage does not appear in
                the top-10.
              </li>
            </ul>
            <p>
              Your job is to judge how useful the retrieved passages are for satisfying the query. A result set
              can still be helpful even if the exact gold passage is missing, and a technically successful set
              can still be weak if most retrieved passages are poor matches.
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded border border-neutral-800 bg-neutral-900/60 p-5">
          <h2 className="text-lg font-semibold">4. Rating definitions</h2>

          <p className="text-sm leading-6 text-neutral-300">
            For all 1-5 ratings, 1 indicates low quality and 5 indicates high quality.
          </p>

          <div className="space-y-4 text-sm leading-6 text-neutral-200">
            <div>
              <h3 className="font-medium text-white">Answerability</h3>
              <p className="text-neutral-300">
                Can the given passage answer the query clearly enough from the provided context?
              </p>
            </div>

            <div>
              <h3 className="font-medium text-white">Specificity (1–5)</h3>
              <p className="text-neutral-300">
                How specifically is the query tied to the provided passage and its context, rather than being vague or broadly applicable?
              </p>
            </div>

            <div>
              <h3 className="font-medium text-white">Query quality (1–5)</h3>
              <p className="text-neutral-300">
                How natural, useful, and realistic is the generated query as something a human might search?
              </p>
            </div>

            <div>
              <h3 className="font-medium text-white">Standalone clarity (1–5)</h3>
              <p className="text-neutral-300">
                Is the query understandable on its own, without missing context or hidden assumptions? References such as "this work", "these results", "the method", or "this approach" can reduce clarity if the missing referent is not clear from the query itself.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-white">Scientific validity (1–5)</h3>
              <p className="text-neutral-300">
                Is the query scientifically faithful to the passage, without incorrect chemistry or misleading framing?
              </p>
            </div>

            <div>
              <h3 className="font-medium text-white">Top-10 relevance overall (1–5)</h3>
              <p className="text-neutral-300">
                Looking at the retrieved set as a whole, how useful are the top-10 passages for answering the query?
              </p>
            </div>

            <div>
              <h3 className="font-medium text-white">Near-miss</h3>
              <p className="text-neutral-300">
                A near-miss is a retrieved passage that is not the exact gold passage but is still strongly relevant
                and likely helpful for the same information need. If no retrieved passage has this property, leave
                the near-miss checkboxes empty. If one or more retrieved passages do have this property, check the
                corresponding retrieved items.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded border border-neutral-800 bg-neutral-900/60 p-5">
          <h2 className="text-lg font-semibold">5. Practical notes</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-300">
            <li>Judge usefulness from the perspective of a realistic human search scenario.</li>
            <li>Do not reward a query only because it is grammatically correct; it should also be meaningful and targeted.</li>
            <li>In Task B, a result can still be useful even when the exact gold passage is missing.</li>
            <li>Use the optional note field to capture anything ambiguous, unusual, or worth revisiting later.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
