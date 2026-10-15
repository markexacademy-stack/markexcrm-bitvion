/**
 * MARKEX Trading Academy — Google Form submission forwarder.
 *
 * Install this as a standalone Apps Script project. Store the webhook
 * secret in Script Properties, never in the source that you share.
 *
 * Required script properties:
 *   WEBHOOK_URL      https://your-domain.example/api/webhooks/google-form
 *   WEBHOOK_SECRET   same value as the CRM WEBHOOK_SECRET
 *   FORM_ID          the ID returned by FormApp.openById / FormApp.getActiveForm().getId()
 *                    Save this same ID in the CRM Google Form ID field.
 */
var PROPERTIES = PropertiesService.getScriptProperties();

function onFormSubmit(event) {
  var formResponse = event && event.response ? event.response : null;
  if (!formResponse) {
    throw new Error('This trigger did not include a form response.');
  }
  var form = FormApp.getActiveForm() || FormApp.openById(requiredProperty_('FORM_ID'));
  var answers = {};
  var items = formResponse.getItemResponses();
  for (var i = 0; i < items.length; i += 1) {
    var item = items[i];
    var value = item.getResponse();
    answers[item.getItem().getTitle()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  var payload = {
    eventId: form.getId() + ':' + formResponse.getId(),
    googleFormId: form.getId(),
    responseTimestamp: formResponse.getTimestamp().toISOString(),
    timestamp: Math.floor(Date.now() / 1000),
    answers: answers,
  };
  postWithRetry_(payload, 3);
}

function installTrigger() {
  var form = FormApp.openById(requiredProperty_('FORM_ID'));
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i += 1) {
    if (triggers[i].getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
}

function postWithRetry_(payload, attemptsLeft) {
  var body = JSON.stringify(payload);
  var response = UrlFetchApp.fetch(requiredProperty_('WEBHOOK_URL'), {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + requiredProperty_('WEBHOOK_SECRET') },
    payload: body,
  });
  var code = response.getResponseCode();
  if (code >= 200 && code < 300) return;
  var message = 'CRM webhook returned HTTP ' + code + ' ' + response.getContentText().slice(0, 500);
  if (code >= 500 && attemptsLeft > 1) {
    Utilities.sleep(2000);
    postWithRetry_(payload, attemptsLeft - 1);
    return;
  }
  console.error(message);
  throw new Error(message);
}

function requiredProperty_(key) {
  var value = PROPERTIES.getProperty(key);
  if (!value) throw new Error('Set the script property ' + key + ' before using this integration.');
  return value;
}
