var QueryString = function () {
		  var query_string = {};
		  var query = window.location.search.substring(1);
		  var vars = query.split("&");
		  for (var i=0;i<vars.length;i++) {
		    var pair = vars[i].split("=");
		    if (typeof query_string[pair[0]] === "undefined") {
		      query_string[pair[0]] = pair[1];
		    } else if (typeof query_string[pair[0]] === "string") {
		      var arr = [ query_string[pair[0]], pair[1] ];
		      query_string[pair[0]] = arr;
		    } else {
		      query_string[pair[0]].push(pair[1]);
		    }
		  }
		    return query_string;
		} ();

		// Init vars from URL
		var username = null,
			appname = 'videoconf',
			accname = 'nbermudezs',
			conferenceId = QueryString.conferenceId,
			displayName = QueryString.displayName || 'Participant',
			peerCalls = [],
			connected = false,
			accessNumber = '+1 (650) 285 0126';

		function container_resize() {
			updateGrid($('#container')[0], peerCalls);
		}

		$( window ).resize(function() {
  			if (connected && peerCalls.length > 0) container_resize();
		});

		function log(str) {
			if (typeof console != "undefined") {
				if (typeof console.log == "function") console.log(str);
			}
		}

		// Assign event handlers
		var voxAPI = VoxImplant.getInstance();
		voxAPI.addEventListener(VoxImplant.Events.SDKReady, onSdkReady);
		voxAPI.addEventListener(VoxImplant.Events.ConnectionEstablished, onConnectionEstablished);
		voxAPI.addEventListener(VoxImplant.Events.ConnectionFailed, onConnectionFailed);
		voxAPI.addEventListener(VoxImplant.Events.ConnectionClosed, onConnectionClosed);
		voxAPI.addEventListener(VoxImplant.Events.AuthResult, onAuthResult);
		voxAPI.addEventListener(VoxImplant.Events.IncomingCall, onIncomingCall);
		voxAPI.addEventListener(VoxImplant.Events.MicAccessResult, onMicAccessResult);

		// Override VoxImplant SDK logger
		voxAPI.writeLog = function(message) {
			log("LOG: "+message);
		}

		// Override VoxImplant SDK logger
		voxAPI.writeTrace = function(message) {
			log("TRACE: "+message);
		}

		// Handle SDK ready event
		function onSdkReady(event){
			log("onSDKReady. SDK version: "+event.version);
			log("WebRTC supported: "+voxAPI.isRTCsupported());
			$('div.tip, div.spinner').show();
			// Establish connection
			connect();
		}

		// Connection was established successfully
		function onConnectionEstablished() {
			log("Connection established: "+voxAPI.connected());
			// Create user for login
			var display_name = "";
			if (typeof displayName != "undefined") {
				if (displayName != null && displayName != "") display_name = "&displayName=" + displayName;
			}
			$.get('/users/joinConference?action=JOIN_CONFERENCE'+display_name, function(data) {
				try {
					var result = data;
					if (typeof result.username != "undefined") {
						// Login
						username = result.username;
						authorize(username);
					}
				} catch(e) {
					log(e);
				}
			});
		}

		// Connection couldn't be established
		function onConnectionFailed() {
			log("Connection failed");
		}

		// Connection was closed
		function onConnectionClosed() {
			log("Connection closed");
			var RECONNECT_TIMEOUT = 2000;
			// Try to re-connect in 2 seconds
			setTimeout(voxAPI.connect, RECONNECT_TIMEOUT);
		}

		// Handle authorization result
		function onAuthResult(e) {
			// Logged in successfully
			if (e.result) {
				// Call conference
				createCall();
			} else {
				/**
				* Checking the error code
				* 302 - calculating login hash on server-side using received key
				*/
				if (e.code == 302) {

					var uid = username+"@"+appname+"."+accname+".voximplant.com";
					$.get('/users/getOneTimeKey?key='+e.key+'&username='+username, function(data){
						if (data != "NO_DATA") {
							console.log('DATA?', data);
							voxAPI.loginWithOneTimeKey(uid, data);
						}
					});
				} else {
					log("Authorization failed");
				}
			}
		}

		function onCallConnected(e) {
			log("CallConnected: "+e.call.id());
			outboundCall = e.call;
			outboundCall.showRemoteVideo(false);
			$('div.tip').html('Waiting for other participants');
			$('div.spinner').remove();
			connected = true;
			$('body').append('<div id="control_panel" class="uk-grid"><div class="uk-width-1-1"><form class="uk-form"><fieldset data-uk-margin>Share URL&nbsp;&nbsp;<input id="accessURL_input" type="text" class="uk-form-width-large"></fieldset></form>&nbsp;&nbsp;&nbsp;<span id="pstnInfo">Access Number '+accessNumber+' | PIN '+conferenceId+'</span></div></div>');
			$('#accessURL_input').val(
					window.location.protocol + '//' + window.location.hostname +
					(window.location.port ? ":" + window.location.port : "") +
					"?conferenceId="+conferenceId
			).on("click", function () {
 					$(this).select();
			});
		}

		function onCallDisconnected(e) {
			log("CallDisconnected: "+outboundCall.id()+" Call state: "+outboundCall.state());
			outboundCall = null;
		}

		function onCallFailed(e) {
			log("CallFailed: "+outboundCall.id()+" code: "+e.code+" reason: "+e.reason);
		}

		function onMicAccessResult(e) {
			log("Mic Access Allowed: "+e.result);
			$('div.tip').html('Establishing connection');
			voxAPI.showLocalVideo(true);
			// $('#voximplantlocalvideo').drags();
		}

		function getNameFromURI(uri) {
			if (uri.indexOf('@') != -1) uri = uri.substr(0, uri.indexOf('@'));
			uri = uri.replace("sip:", "");
			return uri;
		}

		function removePeerCall(call, pstn) {
			if (typeof pstn == "undefined") pstn = false;
			if (pstn === true) {
				for (var k = 0; k < peerCalls.length; k++) {
					if (peerCalls[k].call.number() == call) {
						$('#'+peerCalls[k].call.number()).remove();
						peerCalls.splice(k, 1);
					}
				}
			} else {
				for (var k = 0; k < peerCalls.length; k++) {
					if (peerCalls[k].call == call) {
						var num = getNameFromURI(peerCalls[k].call.number());
						$('#'+num).remove();
						peerCalls.splice(k, 1);
					}
				}
			}
			if (peerCalls.length == 0) {
				$('#container').children().show();
				$('#voximplantlocalvideo').removeClass('not-alone');
			}
		}

		function callExists(username) {
			for (var i=0;i<peerCalls.length;i++) {
				if (peerCalls[i].call.number() == username) return true;
			}
			return false;
		}

		function onIncomingCall(e) {
			var headers = e.call.headers();
			log("Incoming call from: "+e.call.number());
			peerCalls.push({call: e.call, displayName: headers["X-DisplayName"]});
			e.call.addEventListener(VoxImplant.CallEvents.Disconnected, function(e) {
				removePeerCall(e.call);
				container_resize();
			});
			e.call.addEventListener(VoxImplant.CallEvents.Failed, function(e) {
				removePeerCall(e.call);
			});
			e.call.addEventListener(VoxImplant.CallEvents.Connected, function(e) {
				e.call.showRemoteVideo(true);
				$('#voximplantlocalvideo').addClass('not-alone');
				voxAPI.setCallActive(e.call, true);
				$('#container').append('<div id="'+getNameFromURI(e.call.number())+'" class="vid"></div>');
				$(document.getElementById(e.call.getVideoElementId())).prependTo("#"+getNameFromURI(e.call.number())).removeAttr("width height");
				container_resize();
				document.getElementById(e.call.getVideoElementId()).play();

			});
			e.call.addEventListener('ICETimeout', function(e){
				log('ICE Timeout. Sending notification to the caller.');
				headers = e.call.headers();
				e.call.hangup();
				outboundCall.sendMessage(JSON.stringify({type: "ICE_FAILED", caller: e.call.number(), callee: username, displayName: headers["X-DisplayName"]}));
			});
			e.call.answer();
		}

		function onProgressToneStart(e) {
			log("ProgessToneStart for call id: "+outboundCall.id());
		}

		function onProgressToneStop(e) {
			log("ProgessToneStop for call id: "+outboundCall.id());
		}

		function onMessage(e) {
			var result;
			log("onMessage: "+e.text+" for call id: "+outboundCall.id());
			try {
				result = JSON.parse(e.text);
			} catch (e) {
				log(e);
			}
			if (typeof result.peers != "undefined") {
				//log(result.peers);

				for (var i=0; i < result.peers.length; i++) {
					// Calling all peers with callerid < username
					if (result.peers[i].callerid < username && !callExists(result.peers[i].callerid)) {
						log("Calling "+result.peers[i].displayName+" ("+result.peers[i].callerid+")");
						var newcall = voxAPI.call(result.peers[i].callerid, true, null, {"X-DirectCall": "true", "X-DisplayName": result.peers[i].displayName});
						peerCalls.push({call: newcall, displayName: result.peers[i].displayName});
						newcall.addEventListener(VoxImplant.CallEvents.Connected, outboundP2Pcall_connected);
						newcall.addEventListener(VoxImplant.CallEvents.RemoteScreenCaptureStarted, function(e){
							$(document.getElementById(e.videoElementId)).addClass('screensharing');
						});
						newcall.addEventListener(VoxImplant.CallEvents.Disconnected, outboundP2Pcall_disconnected);
						newcall.addEventListener(VoxImplant.CallEvents.Failed, outboundP2Pcall_failed);
					}
				}

				for(i=0;i<result.pstnCalls.length;i++) {
					var callerid = result.pstnCalls[i].callerid;
					if (!callExists(callerid)) {
						var call = new artificialCall(callerid);
						peerCalls.push({call: call, displayName: callerid});
						$('#container').css({ 'display': 'block' });
						$('#container').append('<div id="'+callerid+'" class="vid"><div class="pstnImage"><i class="uk-icon-phone-square"></i></div><div class="name">'+callerid+'</div></div>');
						container_resize();
					}
				}

			} else if (result.type == "ICE_FAILED") {
				// if ICE_FAILED we should try to call again
				var newcall = voxAPI.call(result.callee, true, null, {"X-DirectCall": "true", "X-DisplayName": result.displayName});
				peerCalls.push({call: newcall, displayName: result.displayName});
				newcall.addEventListener(VoxImplant.CallEvents.Connected, outboundP2Pcall_connected);
				newcall.addEventListener(VoxImplant.CallEvents.RemoteScreenCaptureStarted, function(e){
					$(document.getElementById(e.videoElementId)).addClass('screensharing');
				});
				newcall.addEventListener(VoxImplant.CallEvents.Disconnected, outboundP2Pcall_disconnected);
				newcall.addEventListener(VoxImplant.CallEvents.Failed, outboundP2Pcall_failed);
				log('ICE Failed, calling again...');
			} else if (result.type == "CALL_PARTICIPANT_CONNECTED") {

				if (typeof result.inbound == "undefined") $('#'+result.number).removeClass('calling').addClass('connected');
				else {
					var call = new artificialCall(result.number);
					peerCalls.push({call: call, displayName: result.number});
					$('#container').css({ 'display': 'block' });
					$('#container').append('<div id="'+result.number+'" class="vid"><div class="pstnImage"><i class="uk-icon-phone-square"></i></div><div class="name">'+result.number+'</div></div>');
					container_resize();
					if (peerCalls.length > 0) {
							$('div.tip').hide();
							$('#voximplantlocalvideo').addClass('not-alone');
					}
				}

			} else if (result.type == "CALL_PARTICIPANT_DISCONNECTED" || result.type == "CALL_PARTICIPANT_FAILED") {
				removePeerCall(result.number, true);
				container_resize();
				if (peerCalls.length == 0) {
					$('#container').css({'display': 'flex'});
					$('div.tip').html('Waiting for other participants').show();
					$('#voximplantlocalvideo').removeClass('not-alone');
				}
			} else if (result.type == "CALL_PARTICIPANT") {
				// Started calling PSTN participant
				var call = new artificialCall(result.number);
				peerCalls.push({call: call, displayName: result.number});
				$('#container').css({ 'display': 'block' });
				$('#container').append('<div id="'+result.number+'" class="vid calling">'+
					'<div class="pstnImage">'+
						'<i class="uk-icon-phone-square"></i>'+
					'</div>'+
					'<div class="name">'+result.number+'</div>'+
					'<div class="keyPad">'+
						'<a href="javascript:void(0);" class="keypadKey">1</a>'+
						'<a href="javascript:void(0);" class="keypadKey">2</a>'+
						'<a href="javascript:void(0);" class="keypadKey">3</a>'+
						'<div class="clear"></div>'+
						'<a href="javascript:void(0);" class="keypadKey">5</a>'+
						'<a href="javascript:void(0);" class="keypadKey">6</a>'+
						'<a href="javascript:void(0);" class="keypadKey">7</a>'+
						'<div class="clear"></div>'+
						'<a href="javascript:void(0);" class="keypadKey">7</a>'+
						'<a href="javascript:void(0);" class="keypadKey">8</a>'+
						'<a href="javascript:void(0);" class="keypadKey">9</a>'+
						'<div class="clear"></div>'+
						'<a href="javascript:void(0);" class="keypadKey">*</a>'+
						'<a href="javascript:void(0);" class="keypadKey">0</a>'+
						'<a href="javascript:void(0);" class="keypadKey">#</a>'+
					'</div>'+
					'</div>');
				container_resize();
				if (peerCalls.length > 0) $('div.tip').hide();
				$('#'+result.number+' a.keypadKey').on('click', function() {
					var num = $(this).parent().parent().attr('id'),
						digit = $(this).text();
					log('keypad click: '+digit+' for call '+num);
					outboundCall.sendMessage(JSON.stringify({type:'SEND_TONE', number: num, digit: digit}));
				});
			}
		}

		function getDisplayName(callerid) {
			for (var i=0; i < peerCalls.length; i++) {
				if (peerCalls[i].call.number() == callerid) return peerCalls[i].displayName;
			}
			return callerid;
		}

		// P2P call to peer connected
		function outboundP2Pcall_connected(e) {
			$('#container').css({
				'display': 'block'
			});
			e.call.showRemoteVideo(true);
			$('#voximplantlocalvideo').addClass('not-alone');
			$('#container').append('<div id="'+e.call.number()+'" class="vid"></div>');
			$(document.getElementById(e.call.getVideoElementId())).prependTo("#"+e.call.number()).removeAttr("width height");
			container_resize();
			document.getElementById(e.call.getVideoElementId()).play();
			voxAPI.setCallActive(e.call, true);
			if (peerCalls.length > 0) $('div.tip').hide();
		}

		// P2P call to peer disconnected
		function outboundP2Pcall_disconnected(e) {
			removePeerCall(e.call);
			container_resize();
			if (peerCalls.length == 0) {
				$('#container').css({'display': 'flex'});
				$('#voximplantlocalvideo').removeClass('not-alone');
				$('div.tip').html('Waiting for other participants').show();
			}
		}

		// P2P call to peer failed
		function outboundP2Pcall_failed(e) {
			removePeerCall(e.call);
			log('Failed P2P call');
			// TODO: call again?
		}

		// Establish connection with VoxImplant cloud
		function connect() {
			log("Establishing connection...");
			voxAPI.connect();
		}

		// Request key for login using calculated hash
		function authorize(username) {
			log("Authorization...");
			$('div.tip').html('Authorizing');
			voxAPI.requestOneTimeLoginKey(username+"@"+appname+"."+accname+".voximplant.com");
		}

		var outboundCall = null;

		// Make call to conference with id = conferenceId
		function createCall() {
			log("Calling conference");
			$('div.tip').html('Joining the conference');
			outboundCall = voxAPI.call("joinconf", true, null, {"X-Conference-Id": conferenceId});
			outboundCall.addEventListener(VoxImplant.CallEvents.Connected, onCallConnected);
			outboundCall.addEventListener(VoxImplant.CallEvents.Disconnected, onCallDisconnected);
			outboundCall.addEventListener(VoxImplant.CallEvents.Failed, onCallFailed);
			outboundCall.addEventListener(VoxImplant.CallEvents.ProgressToneStart, onProgressToneStart);
			outboundCall.addEventListener(VoxImplant.CallEvents.ProgressToneStop, onProgressToneStop);
			outboundCall.addEventListener(VoxImplant.CallEvents.MessageReceived, onMessage);
		}

		// Disconnect
		function disconnectCall() {
			if (outboundCall != null) {
				log("Disconnect call "+outboundCall.id());
				outboundCall.hangup();
			}
		}

		// Close connection with VoxImplant Cloud
		function closeConnection() {
			voxAPI.disconnect();
		}

		// Initialize VoxImplant SDK
		function initSDK() {
			voxAPI.init({
				useRTCOnly: true,
				micRequired: true,
				videoSupport: true
			});
		}

		var artificialCall = function(callerid) {
			var num = callerid;
			this.callerid = function() {
				return num;
			};
			this.number = this.callerid;
		};

		$(document).ready(function(){

			if (typeof conferenceId == "undefined") {
				// Generate Conference Id automatically
				var maximum = 999999,
					minimum = 000000;
				conferenceId = Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
				window.location.href = '/?conferenceId=' + conferenceId;
			} else if (typeof displayName == "undefined") {
				$('#loginPanel').find('h3').html('Join Conference');
				$('#startConfButton').html('Join');
				$('#conferenceId_input').val(conferenceId);
				var login_modal = UIkit.modal('#loginPanel');
				$('#loginPanel').on({
			    	'show.uk.modal': function(){
			    		$('#displayName_input').focus();
			    	}
				});
				login_modal.show();
			} else {
				initSDK();
			}

			$("#loginPanel").find("form.uk-form").submit(function( event ) {
				event.preventDefault();
				var login_modal = UIkit.modal('#loginPanel');
				if ($('#conferenceId_input').val() == "" || $('#displayName_input').val() == "") {
					if ($('#conferenceId_input').val() == "") $('#conferenceId_input').addClass('uk-form-danger');
					if ($('#displayName_input').val() == "") $('#displayName_input').addClass('uk-form-danger');
				} else {
					conferenceId = $('#conferenceId_input').val();
					displayName = $('#displayName_input').val();
					login_modal.hide();
					initSDK();
				}
			});

			$('#participantNumber, #conferenceId_input, #displayName_input').keypress(function() {
				$(this).removeClass('uk-form-danger');
			});

			$('#countrycode').change(function(){
				$('#participantNumber').val($(this).val());
				var strLength= $('#participantNumber').val().length * 2;
				$('#participantNumber').focus();
				$('#participantNumber')[0].setSelectionRange(strLength, strLength);
			});
		});
