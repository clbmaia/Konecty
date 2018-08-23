/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const ua = require('ua-parser');
const bcrypt = require('bcrypt');
const bcryptHash = Meteor.wrapAsync(bcrypt.hash);
const bcryptCompare = Meteor.wrapAsync(bcrypt.compare);

SSR.compileTemplate('resetPassword', Assets.getText('templates/email/resetPassword.html'));

const injectRequestInformation = function(userAgent, session) {
	const r = ua.parse(userAgent);

	session.browser = r.ua.family;
	session.browserVersion = r.ua.toVersionString();
	session.os = r.os.toString();
	session.platform = r.device.family;

	if (_.isString(resolution)) {
		var resolution = JSON.parse(resolution);
		session.resolution = resolution;
	}

	return session;
};


/* Login using email and password
	@param user
	@param password
	@param ns
	@param geolocation
	@param resolution
	@param ip
	@param userAgent
*/
Meteor.registerMethod('auth:login', function(request) {
	let {user, password, ns, geolocation, resolution, userAgent, ip, password_SHA256} = request;

	// Define a session with arguments based on java version
	const accessLog = {
		_createdAt: new Date,
		_updatedAt: new Date,
		ip,
		login: user
	};

	const namespace = MetaObject.findOne({_id: 'Namespace'});

	// If there is a geolocation store it with session
	if (_.isString(geolocation)) {
		geolocation = JSON.parse(geolocation);
		accessLog.geolocation = [geolocation.lng, geolocation.lat];
	} else if (namespace.trackUserGeolocation === true) {
		accessLog.reason = 'Geolocation required';
		injectRequestInformation(userAgent, accessLog);
		Models.AccessFailedLog.insert(accessLog);

		return new Meteor.Error('internal-error', 'O Konecty exige que você habilite a geolocalização do seu navegador.');
	}

	const userRecord = Meteor.users.findOne({$or: [{username: user}, {'emails.address': user}]});

	if (!userRecord) {
		accessLog.reason = `User not found [${user}]`;
		injectRequestInformation(userAgent, accessLog);
		Models.AccessFailedLog.insert(accessLog);

		return new Meteor.Error('internal-error', 'Usuário ou senha inválidos.');
	}

	accessLog._user = [{
		_id: userRecord._id,
		name: userRecord.name,
		group: userRecord.group
	}
	];

	let p = password_SHA256 || password;
	p = {algorithm: 'sha-256', digest: p};

	const logged = Accounts._checkPassword(userRecord, p);

	if (logged.error != null) {
		accessLog.reason = logged.error.reason;
		injectRequestInformation(userAgent, accessLog);
		Models.AccessFailedLog.insert(accessLog);

		return new Meteor.Error('internal-error', 'Usuário ou senha inválidos.');
	}

	if (userRecord.active !== true) {
		accessLog.reason = `User inactive [${user}]`;
		injectRequestInformation(userAgent, accessLog);
		Models.AccessFailedLog.insert(accessLog);
		return new Meteor.Error('internal-error', 'Usuário inativo.', {bugsnag: false});
	}

	const stampedToken = Accounts._generateStampedLoginToken();
	const hashStampedToken = Accounts._hashStampedToken(stampedToken);

	const updateObj = {
		$set: {
			lastLogin: new Date
		},
		$push: {
			'services.resume.loginTokens': hashStampedToken
		}
	};

	Meteor.users.updateOne({_id: userRecord._id}, updateObj);

	injectRequestInformation(userAgent, accessLog);
	if (Models.AccessLog != null) {
		Models.AccessLog.insert(accessLog);
	}

	return {
		success: true,
		logged: true,
		authId: hashStampedToken.hashedToken,
		user: {
			_id: userRecord._id,
			access: userRecord.access,
			admin: userRecord.admin,
			email: __guard__(userRecord.emails != null ? userRecord.emails[0] : undefined, x => x.address),
			group: userRecord.group,
			locale: userRecord.locale,
			login: userRecord.username,
			name: userRecord.name,
			namespace: userRecord.namespace,
			role: userRecord.role
		}
	};
});


/* Logout currently session
	@param authTokenId
*/
Meteor.registerMethod('auth:logout', 'withUser', function(request) {
	const updateObj = {
		$pull: {
			'services.resume.loginTokens': {hashedToken: this.hashedToken}
		}
	};

	Meteor.users.updateOne({_id: this.user._id}, updateObj);

	return {success: true};
});


/* Get information from current session
	@param authTokenId
*/
Meteor.registerMethod('auth:info', 'withUser', function(request) {
	// Get namespace information
	const namespace = MetaObject.findOne({_id: 'Namespace'});

	// TODO Remove
	namespace._id = namespace.ns;
	delete namespace.ns;
	delete namespace.parents;
	delete namespace.type;

	// If no namespace was found return error
	if ((namespace == null)) {
		return new Meteor.Error('internal-error', 'Namespace not found');
	}

	// Mount namespace with Java format
	const response = {
		authId: null, // TODO Remove
		logged: true,
		user: {
			_id: this.user._id,
			access: this.user.access,
			admin: this.user.admin,
			email: __guard__(this.user.emails != null ? this.user.emails[0] : undefined, x => x.address),
			group: this.user.group,
			locale: this.user.locale,
			login: this.user.username,
			name: this.user.name,
			namespace,
			role: this.user.role
		}
	};

	return response;
});


/* Verify if user is logged
	@param authTokenId
*/
Meteor.registerMethod('auth:logged', 'withUser', request => true);


/* Get publlic user info
	@param authTokenId
*/
Meteor.registerMethod('auth:getUser', 'withUser', function(request) {
	return {
		_id: this.user._id,
		access: this.user.access,
		admin: this.user.admin,
		emails: this.user.emails,
		group: this.user.group,
		locale: this.user.locale,
		username: this.user.username,
		name: this.user.name,
		role: this.user.role,
		lastLogin: this.user.lastLogin
	};
});


/* Reset password
	@param user
	@param ns
	@param ip
	@param host
*/
Meteor.registerMethod('auth:resetPassword', function(request) {
	// Map body parameters
	const {user, ns, ip, host} = request;

	const userRecord = Meteor.users.findOne({ $and: [ { active: true }, { $or: [{username: user}, {'emails.address': user}]} ] });

	if (!userRecord) {
		return new Meteor.Error('internal-error', 'Usuário não encontrado.');
	}

	const stampedToken = Accounts._generateStampedLoginToken();
	const hashStampedToken = Accounts._hashStampedToken(stampedToken);

	const updateObj = {
		$set: {
			lastLogin: new Date
		},
		$push: {
			'services.resume.loginTokens': hashStampedToken
		}
	};

	Meteor.users.updateOne({_id: userRecord._id}, updateObj);

	let expireAt = new Date;
	expireAt = new Date(expireAt.setMinutes(expireAt.getMinutes() + 360));

	const token = encodeURIComponent(hashStampedToken.hashedToken);

	const emailData = {
		from: 'Konecty Alerts <alerts@konecty.com>',
		to: __guard__(userRecord.emails != null ? userRecord.emails[0] : undefined, x => x.address),
		subject: '[Konecty] Password Reset',
		template: 'resetPassword.html',
		type: 'Email',
		status: 'Send',
		discard: true,
		data: {
			name: userRecord.name,
			expireAt,
			url: `http://${host}/rest/auth/loginByUrl/${ns}/${token}`
		}
	};

	Models['Message'].insert(emailData);

	// Respond to reset
	return {success: true};
});


/* Set User password
	@param userId
	@param password
*/
Meteor.registerMethod('auth:setPassword', 'withUser', function(request) {
	// Map body parameters
	const {userId, password} = request;

	const access = accessUtils.getAccessFor('User', this.user);

	// If return is false no access was found then return 401 (Unauthorized)
	if (!_.isObject(access)) {
		return new Meteor.Error('internal-error', 'Permissão negada.');
	}

	const userRecord = Meteor.users.findOne({$or: [{_id: userId}, {username: userId}, {'emails.address': userId}]});

	if (!userRecord) {
		return new Meteor.Error('internal-error', 'Usuário não encontrado.');
	}

	if ((this.user.admin !== true) && (this.user._id !== userRecord._id) && (access.changePassword !== true)) {
		return new Meteor.Error('internal-error', 'Permissão negada.');
	}

	Accounts.setPassword(userRecord._id, password);

	return {success: true};
});


/* Set a random password for User and send by email
	@param userIds
*/
Meteor.registerMethod('auth:setRandomPasswordAndSendByEmail', 'withUser', function(request) {
	// Map body parameters
	const {userIds} = request;

	check(userIds, [String]);

	const access = accessUtils.getAccessFor('User', this.user);

	// If return is false no access was found then return 401 (Unauthorized)
	if (!_.isObject(access)) {
		return new Meteor.Error('internal-error', 'Permissão negada.');
	}

	let userRecords = Meteor.users.find({$or: [
		{_id: {$in: userIds}},
		{username: {$in: userIds}},
		{'emails.address': {$in: userIds}}
	]});

	userRecords = userRecords.fetch();

	if (userRecords.length === 0) {
		return new Meteor.Error('internal-error', 'Nenhum usuário encontrado.');
	}

	const errors = [];

	for (let userRecord of Array.from(userRecords)) {
		if ((__guard__(userRecord.emails != null ? userRecord.emails[0] : undefined, x => x.address) == null)) {
			errors.push(new Meteor.Error('internal-error', `Usuário [${userRecord.username}] sem email definido.`));
			continue;
		}

		if ((this.user.admin !== true) && (this.user._id !== userRecord._id) && (access.changePassword !== true)) {
			errors.push(new Meteor.Error('internal-error', `Permissão negada para alterar a senha do usuário [${userRecord.username}].`));
			continue;
		}

		const password = Random.id(6).toLowerCase();
		const data = { 
			username: userRecord.username,
			password,
			name: userRecord.name
		};

		Accounts.setPassword(userRecord._id, password);

		const html = SSR.render('resetPassword', {
			password,
			data
		}
		);

		Models['Message'].insert({
			from: 'Konecty <support@konecty.com>',
			to: __guard__(userRecord.emails != null ? userRecord.emails[0] : undefined, x1 => x1.address),
			subject: '[Konecty] Sua nova senha',
			body: html,
			type: 'Email',
			status: 'Send',
			discard: true
		});
	}

	if (errors.length > 0) {
		return {
			success: false,
			errors
		};
	}

	return {success: true};
});


/* Set geolocation for current session
	@param longitude
	@param latitude
	@param userAgent
	@param ip
*/
Meteor.registerMethod('auth:setGeolocation', 'withUser', function(request) {
	if ((Models.AccessLog == null)) {
		return new Meteor.Error('internal-error', 'Models.AccessLog not defined.');
	}

	const {longitude, latitude, userAgent, ip} = request;

	if ((longitude == null) || (latitude == null)) {
		return new Meteor.Error('internal-error', 'Longitude or Latitude not defined');
	}

	const accessLog = {
		_createdAt: new Date,
		_updatedAt: new Date,
		ip,
		login: this.user.username,
		geolocation: [longitude, latitude],
		_user: [{
			_id: this.user._id,
			name: this.user.name,
			group: this.user.group
		}
		]
	};

	injectRequestInformation(userAgent, accessLog);
	Models.AccessLog.insert(accessLog);

	return {
		success: true
	};
});


Accounts.onCreateUser(function(options, user) {
	if ((user.code == null)) {
		user.code = metaUtils.getNextCode('User', 'code');
	}
	return user;
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}