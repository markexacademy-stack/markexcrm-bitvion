# Google Forms setup

The CRM stores a Google Form URL and receives submissions. It does not create the form inside Google.

## 1. Create the form

1. Open [Google Forms](https://docs.google.com/forms/u/0/).
2. Create the registration form. Include questions whose titles can map to the student name, email address, phone, course, and consent.
3. Choose the link icon and copy the public responder URL. It should look like `https://docs.google.com/forms/d/e/.../viewform` or `https://docs.google.com/forms/d/.../viewform`.
4. In the CRM, open **Registration Forms → Add registration form**, paste that URL, choose a course, and save. The form status stays **Not tested**.

## 2. Link a response spreadsheet

In the Google Form, open **Responses → Link to Sheets**. Copy the spreadsheet ID from the sheet URL (`https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit`) into the form’s spreadsheet field. This step is required only for spreadsheet synchronization.

## 3. Install the Apps Script

1. Open [Apps Script](https://script.google.com) and create a standalone project.
2. Replace the default file with `apps-script/Code.gs` and add `apps-script/appsscript.json`.
3. Open **Project settings → Script properties** and set:

| Property | Value |
| --- | --- |
| `WEBHOOK_URL` | `https://your-crm-host/api/webhooks/google-form` |
| `WEBHOOK_SECRET` | The same value as `WEBHOOK_SECRET` in the CRM environment |
| `FORM_ID` | Run `FormApp.openById('...').getId()` or, in a form-bound script, `FormApp.getActiveForm().getId()` |

4. In the CRM form configuration, set **Google Form ID** to that same `FORM_ID` when it differs from the published URL id.
5. Run `installTrigger` once and authorize the script. This creates an installable **On form submit** trigger.
6. Submit a test response. The script posts JSON with a bearer token. A `4xx` response is not retried. A `5xx` response is retried up to three times. The CRM stores the event id and ignores a repeated delivery.

## 4. Test the connection

In the form’s CRM page, choose **Test integration**.

- The public form URL must respond as a Google Forms page.
- If a spreadsheet ID is saved, Sheets credentials must also be able to read that spreadsheet.
- The status becomes **Verified** only when the checks that are configured actually succeed.
- **Synchronize responses** reads the sheet only when `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` are set. Share the spreadsheet with that service account. Without those credentials, use the webhook instead.

## 5. What a submission does

The CRM checks the webhook secret, validates the payload, normalizes the email, and applies the duplicate policy in Settings. The default policy flags a repeat submission and does not replace existing student details. A registration confirmation is queued once per student, after the student record is saved. If Resend is not configured, the job stays queued.
