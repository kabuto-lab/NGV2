# Careers forms in the Astro site

The old WordPress careers page contains two Contact Form 7 forms:

| Form | CF7 ID | Purpose |
| --- | ---: | --- |
| Short application | 12 | Name, email, Telegram |
| Candidate questionnaire | 7782 | Contact, identity, education and employment details |

The Astro careers pages render both forms in `src/components/CareerForms.astro`. They submit to same-origin `/api/careers/short` and `/api/careers/full` endpoints, handled by Nginx. The Nginx locations forward the requests over TLS to the existing WordPress server at `77.222.40.254`. There is no applicant-data database on the Astro server. WordPress remains the system that receives and delivers submissions.

The routes are in `deploy/nextgenium-preview.conf` and `deploy/nextgenium-production-https.conf`. Both must be installed with the corresponding static release. The production site currently uses the temporary WordPress rollback configuration, so installing the Astro release alone would not make the new forms public.

The old page loads Contact Form 7's reCAPTCHA v3 key. The Astro client obtains a token on `next-genium.com` before submitting. The preview hostname is not registered for that key, so it can verify rendering and required-field validation but cannot prove that a fully completed application will be accepted. Before moving production back to Astro, send a deliberately marked test application with authorization from the HR recipient, verify it arrived, and remove that test record from the HR workflow.

The full questionnaire includes passport and registered-address fields because they are present in the old form. Confirm with the studio whether these should be collected only after selection. The full form is in a separate expandable section for that reason. The policy links point to the corresponding Astro policy pages.

Long-term independence from WordPress requires a new server-side endpoint and an agreed delivery/storage system. Do not move applicant data into Storyblok or a static build.
