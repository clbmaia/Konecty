/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
Meteor.startup(function() {
	Accounts.loginServiceConfiguration.remove({
		service: "google"});

	if (Namespace.googleApp != null) {
		return Accounts.loginServiceConfiguration.insert({
			service: "google",
			clientId: Namespace.googleApp.clientId,
			secret: Namespace.googleApp.secret
		});
	}
});
