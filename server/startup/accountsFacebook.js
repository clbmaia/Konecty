/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
Meteor.startup(function() {
	Accounts.loginServiceConfiguration.remove({
		service: "facebook"});

	if (Namespace.facebookApp != null) {
		return Accounts.loginServiceConfiguration.insert({
			service: "facebook",
			appId: Namespace.facebookApp.appId,
			secret: Namespace.facebookApp.secret
		});
	}
});
