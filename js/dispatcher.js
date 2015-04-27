

// See http://stackoverflow.com/questions/7544550/javascript-regex-to-change-all-relative-urls-to-absolute
function canonicalUrl( url ) {
  /* Only accept commonly trusted protocols:
   * Only data-image URLs are accepted, Exotic flavours (escaped slash,
   * html-entitied characters) are not supported to keep the function fast */
  if ( /^(https?|file|ftps?|mailto|javascript|data:image\/[^;]{2,9};):/i.test(url) ) {
    return url; //url is already absolute
  }

  var base_url = location.href.match( /^(.+)\/?(?:#.+)?$/ )[0] + '/';
  if ( url.substring(0, 2) == '//' ) {
    return location.protocol + url;
  } else if ( url.charAt(0) == '/' ) {
    return location.protocol + '//' + location.host + url;
  } else if ( url.substring(0,2) == './' ) {
    url = '.' + url;
  } else if ( /^\s*$/.test(url) ) {
      return ''; // empty, return nothing
  } else {
    url = '../' + url;
  }

  url = base_url + url;
  var i = 0; // sanity check
  while ( i < 100 && /\/\.\.\//.test( url = url.replace( /[^\/]+\/+\.\.\//g, '' ) ) ) {
    i += 1;
  }

  // Escape certain characters to prevent XSS 
  url = url.replace( /\.$/, '' ).replace( /\/\./g, '' ).replace( /"/g, '%22' )
    .replace( /'/g, '%27' ).replace( /</g, '%3C' ).replace( />/g, '%3E' );
  return url;
}

function redirect( uri_path ) {
  var url = canonicalUrl( uri_path );
  window.location.href = url;
}

function parseQueryString() {
  var qs = { };
  
  // replace addition symbol with a space
  var decode = function(s) { return decodeURIComponent( s.replace( /\+/g, ' ' ) ); };
  // get rid of leading '?'
  var query  = window.location.search.substring(1);

  var search = /([^&=]+)=?([^&]*)/g;
  var match;
  while ( match = search.exec( query ) ) {
    qs[decode( match[1] )] = decode( match[2] );
  }
  return qs;
}

function serializeFormJSON( form_selector ) {
  var o = { };
  var a = $( form_selector ).serializeArray();
  $.each( a, function() {
    if ( o[this.name] ) {
      if ( !o[this.name].push ) {
        o[this.name] = [o[this.name]];
      }
      o[this.name].push( this.value || '' );
    } else {
      o[this.name] = this.value || '';
    }
  });
  return o;
}

// Flux
var Flux = DeLorean.Flux;

var RactiveView = function( store, ractive, storeName ) {
  this.store = store;
  this.ractive = ractive;
  this.prefix = 'stores.' + storeName + '.store.';
};

RactiveView.prototype = {
  update: function( key_path, data, msg ) {
    key_path = this.prefix + key_path;
    console.log( 'updating ' + key_path + ' with ' + msg );
    this.ractive.set( key_path, data );
  }
};

function setupRactiveStores( ractive ) {
  for (var key in ractive.data.stores) {
    var store = ractive.data.stores[key];
    store.store.setView( ractive, key );
  }
}

// Stores
// Flash message store
// Module-local data used by FlashStore
var _flash_cache = [ ];
var _flash_keys = { };

var FlashStore = Flux.createStore({
  storage: $.localStorage,
  view: null,
  messages: _flash_cache,

  setView: function( ractive, storeName ) {
    this.view = new RactiveView( this, ractive, storeName );
  },
  updateViews: function( key_path, data, msg ) {
    if ( this.view ) {
      this.view.update( key_path, data, msg );
    }
  },
  storageGetArray: function( arrayName ) {
    var thisArray = [ ];
    if ( !this.storage.isEmpty( arrayName ) ) {
      // jQuery-Storage-API handles serialization
      thisArray = this.storage.get( arrayName );
    }
    return thisArray;
  },
  storageSetArray: function( arrayName, array ) {
    // jQuery-Storage-API handles serialization
    this.storage.set( arrayName, array );
  },
  storageDeleteArray: function( arrayName ) {
    this.storage.remove( arrayName );
  },
  storagePush: function( arrayName, arrayItem ) {
    var existingArray = this.storageGetArray( arrayName );
    existingArray.push( arrayItem );
    this.storageSetArray( arrayName, existingArray );
  },
  storagePop: function( arrayName ) {
    var arrayItem = { };
    var existingArray = this.storageGetArray( arrayName );
    if ( existingArray.length > 0 ) {
      arrayItem = existingArray.pop();
      this.storageSetArray( arrayName, existingArray );
    }
    return arrayItem;
  },
  storageShift: function( arrayName ) {
    var arrayItem = { };
    var existingArray = this.storageGetArray( arrayName );
    if ( existingArray.length > 0 ) {
      arrayItem = existingArray.shift();
      this.storageSetArray( arrayName, existingArray );
    }
    return arrayItem;
  },
  storageUnshift: function( arrayName, arrayItem ) {
    var existingArray = this.storageGetArray( arrayName );
    existingArray.unshift( arrayItem );
    this.storageSetArray( arrayName, existingArray );
  },
  mark: function() {
    _flash_keys = { };
    var keys = this.storage.keys();

    /* mark all levels in storage */
    for ( var i = 0; i < keys.length; i++ ) {
      var key = keys[i].match( /^flash_(.+)$/ );
      if ( key ) {
        var level = key[1];
        _flash_keys[level] = true;
      }
    }
  },
  sweep: function() {
    var keys = Object.keys( _flash_keys );
    var self = this;
    $.each( keys, function( i, level ) {
      self.storageDeleteArray( 'flash_' + level );
    });
    _flash_keys = { };
  },
  // Pull flash messages from local storage and display them
  // Then remove from local storage
  loadFromStorage: function() {
    this.mark();
    var self = this;
    var keys = Object.keys( _flash_keys );
    $.each( keys, function( i, level ) {
      var msgs = self.storageGetArray( 'flash_' + level );
      $.each( msgs, function( j, msg ) {
        self.messages.push({ level: level, html: msg } );
      });
    });
    this.sweep();
    this.updateViews( 'messages', this.messages, 
      this.messages.length.toString() + ' messages' );
    this.emit( 'change' );
  },
  // Store the entry in the local storage but do not display it
  saveToStorage: function( data ) {
    this.storagePush( 'flash_' + data.level, data.html );
    this.emit( 'change' );
  },
  // Store the entry in cache and display it, and also save it to local storage
  post: function( data ) {
    this.messages = [ ];
    this.messages.push( data );
    this.updateViews( 'messages', this.messages, 
      this.messages.length.toString() + ' messages' );
    // 'change' emitted
    this.saveToStorage( data );
  },
  clear: function( data ) {
    this.messages = [ ];
    this.updateViews( 'messages', this.messages, 
      this.messages.length.toString() + ' messages' );
    this.emit( 'change' );
  },
  loginChanged: function( data ) {
    if ( data && data.token ) {
      // 'change' emitted
      this.post( { level: 'notice', html: 'Your login was successful!' } );
    } else {
      // 'change' emitted
      this.post( { level: 'notice', html: 'You have been logged out.' } );
    }
  },
  accountConfirmed: function( data ) {
    if ( data && data.token ) {
      // 'change' emitted
      this.post( { level: 'notice', html: 'Your account has been activated!' } );
    }
  },
  confirmationFailure: function( data ) {
    var message = 'The email address for your account could not be confirmed (' + data.error + ').';
    console.log( message );
    // 'change' emitted
    this.post( { level: 'error', html: message } );
  },
  loginFailure: function( data ) {
    var message = 'Your login failed (' + data.error + ').';
    console.log( message );
    // 'change' emitted
    this.post( { level: 'error', html: message } );
  },
  playerFailure: function( data ) {
    var message = 'Registering the player failed: ' + data.error;
    console.log( message );
    // 'change' emitted
    this.post( { level: 'error', html: message } );
  },
  channelFailure: function( data ) {
    var message = 'Fetching available channels failed: ' + data.error;
    console.log( message );
    // 'change' emitted
    this.post( { level: 'error', html: message } );
  },
  streamFailure: function( data ) {
    var message = 'Connection to stream failed: ' + data.error;
    console.log( message );
    // 'change' emitted
    this.post( { level: 'error', html: message } );
  },
  signUpFailure: function( data ) {
    if ( data && data.error ) {
      var message = data.error;
      // 'change' emitted
      this.post( { level: 'error', html: message } );
    } else {
      this.emit( 'change' );
    }
  },
  subscriptionCreated: function( data ) {
    var message = 'Your subscription order, id ' + data.subscription.uuid + ' was confirmed.';
    console.log( message );
    // 'change' emitted
    this.post( { level: 'info', html: message } );
  },
  subscriptionFailure: function( data ) {
    var message = 'Subscription order failed: ' + data.error;
    console.log( message );
    // 'change' emitted
    this.post( { level: 'error', html: message } );
  },

  actions: {
    'flash': 'saveToStorage',
    'flash:now': 'post',
    'flash:show': 'loadFromStorage',
    'flash:clear': 'clear',
    'login:changed': 'loginChanged',
    'login:failure': 'loginFailure',
    'auth:confirmed': 'accountConfirmed',
    'auth:confirmationFailure': 'confirmationFailure',
    'player:registrationFailure': 'playerFailure',
    'player:channelFailure': 'channelFailure',
    'stream:failure': 'streamFailure',
    'signup:step1': 'signUpFailure',
    'signup:failure': 'signUpFailure',
    'recurly:subscriptionCreated': 'subscriptionCreated',
    'recurly:subscriptionFailure': 'subscriptionFailure'
  }
});
var flashStore = new FlashStore();

// Auth token store
// Module-local data used by FlashStore
var _user_data = { };

var AuthStore = Flux.createStore({
  storage: $.localStorage,
  view: null,
  user_data: _user_data,
  next_step: 0,
  form_errors: {
    signup1: [ ],
    signup2: [ ],
    account: [ ],
    password: [ ]
  },

  setView: function( ractive, storeName ) {
    this.view = new RactiveView( this, ractive, storeName );
  },
  updateViews: function( key_path, data, msg ) {
    if ( this.view ) {
      this.view.update( key_path, data, msg );
    }
  },
  nextStep: function( step ) {
    this.form_errors = { 
      signup1: [ ], 
      signup2: [ ],
      account: [ ],
      password: [ ]
    };
    this.updateViews( 'form_errors', this.form_errors, 'clear' );
    this.next_step = step;
    this.updateViews( 'next_step', this.next_step, step );
 },
  setAnonymous: function( data ) {
    this.storage.remove( 'jwt' );
    this.user_data = { user: { name: 'guest', anonymous: true }, token: null };
    this.updateViews( 'user_data', this.user_data, 'anonymous user' );
  },
  loadToken: function() {
    var token = this.storage.get( 'jwt' );
    var user = this.storage.get( 'user' );
    if ( user && token ) {
      this.user_data = { user: user, token: token };
      this.updateViews( 'user_data', this.user_data, 
        'logged in user and token loaded' );
      this.emit( 'change' );
    } else {
      // 'change' emitted
      this.setAnonymous();
    }
  },
  verifyUser: function() {
    if ( this.user_data.user && this.user_data.token ) {
    } else {
      this.emit( 'rollback' );
    }
  },
  accountProfile: function( data ) {
    if ( data && data.account ) {
      this.user_data.account = data.account;
      this.updateViews( 'user_data.account', this.user_data.account,
        this.user_data.account.username + ' loaded' );
    }
    this.emit( 'change' );
  },
  accountUpdated: function( data ) {
    if ( data ) {
      if ( data.account ) {
        this.user_data.account = data.account;
        this.updateViews( 'user_data.account', this.user_data.account,
            this.user_data.account.username + ' updated' );
      }
      if ( data.next ) {
        redirect( data.next );
      }
    }
    this.emit( 'change' );
  },
  accountFailure: function( data ) {
    if ( data && data.error && data.next ) {
      redirect( data.next );
    } else if ( data && data.error && data.detail ) {
      var detail = data.detail;
      this.form_errors.account = [ ];
      $.each( detail, function( key, messages ) {
        this.form_errors.account.push( { field: key, error: messages[0] } );
      });
      this.updateViews( 'form_errors.account', this.form_errors.account,
        this.form_errors.account.length + ' errors');
    }
    this.emit( 'change' );
  },
  loginChanged: function( data ) {
    this.nextStep( 2 );
    if ( data && data.token ) {
      this.storage.set( 'jwt', data.token );
      this.storage.set( 'user', data.user );
      this.user_data = data; // also clears out signup_token
      this.updateViews( 'user_data', this.user_data, 
        'logged in user and token' );
    } else {
      // 'change' emitted
      this.setAnonymous( data );
    }
    if ( data && data.next ) {
      redirect( data.next );
    }
    this.emit( 'change' );
  },
  signUpStep1: function( data ) {
    if ( data && data.token ) {
      this.user_data.signup_token = data.token;
      this.updateViews( 'user_data.signup_token', this.user_data.signup_token, 
        'added signup token' );
      this.form_errors.signup1 = [ ];
      this.updateViews( 'form_errors.signup1', this.form_errors.signup1, 'clear' ); 
    } else if ( data && data.error && data.detail ) {
      this.form_errors.signup1 = [ ];
      var self = this;
      var detail = data.detail;
      $.each( detail, function( key, messages ) {
        self.form_errors.signup1.push( { field: key, error: messages[0] } );
      });
      this.updateViews( 'form_errors.signup1', this.form_errors.signup1,
        this.form_errors.signup1.length + ' errors');
    }
    this.emit( 'change' );
  },
  signUpFailure: function( data ) {
    if ( data && data.error && data.detail ) {
      this.form_errors.signup2 = [ ];
      var self = this;
      var detail = data.detail;
      $.each( detail, function( key, messages ) {
        self.form_errors.signup2.push( { field: key, error: messages[0] } );
      });
      this.updateViews( 'form_errors.signup2', this.form_errors.signup2,
        this.form_errors.signup2.length + ' errors');
    }
    this.emit( 'change' );
  },
  passwordResetSent: function( data ) {
    this.nextStep( 2 );
    this.emit( 'change' );
  },
  passwordResetFailure: function( data ) {
    this.emit( 'change' );
  },
  passwordChanged: function( data ) {
    if ( data && data.token ) {
      this.nextStep( 3 );
      this.storage.set( 'jwt', data.token );
      this.storage.set( 'user', data.user );
      this.user_data = data; // also clears out signup_token
      this.updateViews( 'user_data', this.user_data, 
        'logged in user and token' );
    } else {
      // 'change' emitted
      this.setAnonymous( data );
    }
    if ( data && data.next ) {
      redirect( data.next );
    }
    this.emit( 'change' );
  },
  passwordFailure: function( data ) {
    if ( data && data.error && data.detail ) {
      this.form_errors.password = [ ];
      var self = this;
      var detail = data.detail;
      $.each( detail, function( key, messages ) {
        self.form_errors.password.push( { field: key, error: messages[0] } );
      });
      this.updateViews( 'form_errors.password', this.form_errors.password,
        this.form_errors.password.length + ' errors');
    }
    this.emit( 'change' );
  },
  subscriptionCreated: function( data ) {
    this.nextStep( 4 );
    if ( data && data.next ) {
      redirect( data.next );
    }
    this.emit( 'change' );
  },
  actions: {
    'auth:loadToken': 'loadToken',
    'auth:verifyUser': 'verifyUser',
    'auth:confirmed': 'loginChanged',
    'auth:passwordResetSent': 'passwordResetSent',
    'auth:passwordResetFailure': 'passwordResetFailure',
    'auth:passwordChanged': 'passwordChanged',
    'auth:passwordFailure': 'passwordFailure',
    'login:changed': 'loginChanged',
    'login:failure': 'setAnonymous',
    'signup:step1': 'signUpStep1',
    'signup:failure': 'signUpFailure',
    'account:profile': 'accountProfile',
    'account:updated': 'accountUpdated',
    'account:failure': 'accountFailure',
    'recurly:subscriptionCreated': 'subscriptionCreated'
  }
});
var authStore = new AuthStore();

var _player_data = { 
  player: null,
  loading:         { 
    current:  { path: null, time: 0, status: 'none' },
    previous: { path: null, time: 0, status: 'none' }
  },
  stream: { 
    path:          '',
    index_file:    '',
    metadata_file: '' 
  },
  now_playing: { full_title: 'Select a Channel...' },
  coming_up:   { full_title: '' }
};

var _channel_data = {
  channels: [ ],
  mix_name: 'My Custom Mix',
  active_channel: { }
};

var PlayerStore = Flux.createStore({
  storage: $.localStorage,
  view: null,
  player_data: _player_data,
  channel_data: _channel_data,

  setView: function( ractive, storeName ) {
    this.view = new RactiveView( this, ractive, storeName );
  },
  updateViews: function( key_path, data, msg ) {
    if ( this.view ) {
      this.view.update( key_path, data, msg );
    }
  },
  clearNowPlaying: function( text ) {
    this.player_data.now_playing = { full_title: text };
    this.player_data.coming_up   = { full_title: '' };
    this.updateViews( 'player_data.now_playing', this.player_data.now_playing, text );
    this.updateViews( 'player_data.coming_up', this.player_data.coming_up, '' );
  },
  clearStream: function() {
    this.storage.remove( 'stream' );
    this.player_data.stream = { };
    this.updateViews( 'player_data.stream', this.player_data.stream, 'null' );
  },
  clearActiveChannel: function() {
    this.channel_data.active_channel = { };
    this.updateViews( 'channel_data.active_channel', this.channel_data.active_channel, 
      ' clear active channel' );
  },
  clearLoading: function( stream_path, result ) {
    var old_loading_time = this.player_data.loading.current.time;
    if ( old_loading_time ) {
      this.player_data.loading.previous = this.player_data.loading.current;
      this.player_data.loading.previous.result = result;
      this.player_data.loading.current.time = 0;
      this.updateViews( 'player_data.loading', this.player_data.loading, 
        '0, was ' + this.player_data.loading.previous.path + ' at ' + old_loading_time );
    }
  },
  validateChannels: function() {
    var i_custom = -1;
    var channels = this.storage.get( 'channels' );
    var active_channel = this.storage.get( 'active_channel' );
    if ( active_channel && active_channel.path ) {
      var path = active_channel.path;
      var i_standard = -1;
      var i_active = -1;
      var n_active = 0;
      for ( var i = 0; i < 7 && i < channels.length; i++ ) {
        if ( !channels[i].active ) { break; }
        n_active += 1;
        if ( i_custom < 0 && channels[i].custom ) { i_custom = i; }
        if ( i_standard < 0 && !channels[i].custom ) { i_standard = i; }
        if ( i_active < 0 && channels[i].path == path ) { i_active = i; }
      }
      if ( n_active < 7 ) {
        console.log( '*** only first ' + n_active + ' channels are active ***' );
      }
      if ( i_custom != 0 ) {
        console.log( '*** first channel is not custom ***' );
      }
      if ( i_standard != 1 ) {
        console.log( '*** second channel is not standard ***' );
      }
      if ( i_active < 0 ) {
        console.log( '*** active path ' + path + ' not found in active channel list ***' );
        active_channel = i_standard >= 0 ? channels[i_standard] : { };
        this.storage.set( 'active_channel', active_channel );
      }
    } else {
      active_channel = { };
    }  
    this.channel_data.active_channel = active_channel;
    this.channel_data.mix_name = i_custom >= 0 ? channels[i_custom].name : 'No Mix';
  },
  // Dispatched methods
  loadingStream: function( stream_path ) {
    // milliseconds after epoch
    var millis = new Date().getTime();
    this.player_data.loading.current = { path: stream_path, time: millis, status: 'loading' };
    this.updateViews( 'player_data.loading.current', this.player_data.loading.current, 
      'loading ' + stream_path + ' at ' + millis );
    this.emit( 'change' );
  },
  streamChanged: function( data ) {
    if ( !data ) {
      data = {
        stream: { 
          path:          '',
          index_file:    '',
          metadata_file: '' 
        }
      };
    }
    if ( data.stream && data.stream.path ) {
      var millis = new Date().getTime();
      console.log( 'streamChanged - ' + data.stream.path );
      this.storage.set( 'stream', data.stream );
      this.player_data.stream = data.stream;
      this.updateViews( 'player_data.stream', this.player_data.stream, data.stream.path );
    } else {
      console.log( 'streamChanged - null - clearing' );
      this.clearNowPlaying( 'Loading...' );
      this.clearLoading( data.stream.path, 'none' );
    }
    this.emit( 'change' );
  },
  streamFailure: function( data ) {
    if ( data && data.stream && data.stream.path ) {
      console.log( 'streamFailure ' + data.stream.path + ' - will clear loading' );
      this.clearActiveChannel();
      this.clearNowPlaying( 'Select a Channel...' );
      this.clearStream();
      this.clearLoading( data.stream.path, 'failure' );
    }
    this.emit( 'change' );
  },
  nowPlaying: function( data ) {
    if ( data && data.now_playing && 
      data.now_playing.full_title != this.player_data.now_playing.full_title ) {
      this.player_data.now_playing = data.now_playing;
      this.updateViews( 'player_data.now_playing', this.player_data.now_playing, 
        this.player_data.now_playing.full_title );
    }
    if ( data && data.coming_up && 
      data.coming_up.full_title != this.player_data.coming_up.full_title ) {
      this.player_data.coming_up   = data.coming_up;
      this.updateViews( 'player_data.coming_up',   this.player_data.coming_up,
        this.player_data.coming_up.full_title );
    }
    this.emit( 'change' );
  },
  loadPlayer: function() {
    var player = this.storage.get( 'player' );
    if ( player && player.id ) {
      this.player_data.player = player;
      this.updateViews( 'player_data.player', this.player_data.player, 
        this.player_data.player.id + ' loaded' );
    }
    this.emit( 'change' );
  },
  setupChannels: function( channels ) {
    if ( channels ) {
      console.log('received ' + channels.length + ' channels');
      console.log('first (custom): ' + channels[0].path);
      this.storage.set( 'channels', channels );
      this.channel_data.channels = channels.slice(0);
    }
    this.validateChannels();
    this.updateViews( 'channel_data', this.channel_data, 
      this.channel_data.channels.length.toString() + ' channels' );
  },
  moveChannelToTop: function( sourceIndex ) {
    var channels = this.channel_data.channels;
    // remove source from array
    var source = channels.splice( sourceIndex, 1 )[0];
    // add source back to array at position 1 ( position 0 is hidden )
    channels.splice( 1, 0, source );
    this.updateViews( 'channel_data.channels', channels, 
      'moved channel ' + sourceIndex + ' to top' );
  },
  playerRegistered: function( data ) {
    if ( data.player ) {
      var reg_player = { id: data.player.id, media_format: data.player.media_format };
      this.storage.set( 'player', reg_player );
      this.player_data.player = reg_player;
      this.updateViews( 'player_data.player', this.player_data.player, 
        this.player_data.player.id + ' registered' );
      if ( data.player.channels ) {
        this.setupChannels( data.player.channels );
      }
    }
    this.emit( 'change' );
  },
  channelData: function( data ) {
    this.setupChannels( data.channels );
    this.emit( 'change' );
  },
  loadChannels: function() {
    var channels = this.storage.get( 'channels' );
    if ( channels ) {
      console.log('loaded ' + channels.length + ' channels');
      console.log('first (custom): ' + channels[0].path);
      this.channel_data.channels = channels.slice(0);
    }
    this.validateChannels();
    this.updateViews( 'channel_data', this.channel_data,
      this.channel_data.channels.length.toString() + ' channels loaded' );
    this.emit( 'change' );
  },
  selectChannel: function( channel_path, media_format ) {
    var channels = this.storage.get( 'channels' );
    var channel_changed = false;
    if ( channels ) {
      var i_active = -1;
      for ( var i = 0; i < 7 && i < channels.length; i++ ) {
        if ( channels[i].active ) {
          if ( channels[i].path == channel_path ) { i_active = i; break; }
        }
      }
      if ( i_active >= 0 ) {
        this.storage.set( 'active_channel', channels[i_active] );
        this.channel_data.active_channel = channels[i_active];
        var channel_type = channels[i_active].custom ? 'custom: ' : 'standard: ';
        this.updateViews( 'channel_data.active_channel', this.channel_data.active_channel,
          channel_type + this.channel_data.active_channel.name );
        channel_changed = true; 
      }
    }
    if ( true /* channel_changed */ ) {
      var stream_path = channel_path + '-' + media_format;
      this.streamChanged( null );
    } else {
      this.emit( 'change' );
    }
  },
  userReset: function() {
    var player = this.storage.get( 'player' );
    this.player_data = { 
      player:  player,
      loading:         { 
        current:  { path: null, time: 0, status: 'none' },
        previous: { path: null, time: 0, status: 'none' }
      },
      stream: { 
        path:          '',
        index_file:    '',
        metadata_file: '' 
      },
      now_playing: { full_title: 'Select a Channel...' },
      coming_up:   { full_title: '' }
    };
    this.channel_data = {
      channels: [ ],
      mix_name: 'My Custom Mix',
      active_channel: { }
    };
    // leave player in place in local storage
    this.storage.remove( 'stream' );
    this.storage.remove( 'active_channel' );
    this.storage.remove( 'channels' );
    this.updateViews( 'player_data', this.player_data, 'reset for changed user' ); 
    this.updateViews( 'channel_data', this.channel_data, 'reset for changed user' );
    this.emit( 'change ');
  },
  loginChanged: function( data ) {
    this.userReset();
  },
  actions: {
    'stream:loading': 'loadingStream',
    'stream:waiting': 'streamChanged',
    'stream:changed': 'streamChanged',
    'stream:failure': 'streamFailure',
    'stream:nowPlaying': 'nowPlaying',
    'player:load': 'loadPlayer',
    'player:registered': 'playerRegistered',
    'player:channelData': 'channelData',
    'player:loadChannels': 'loadChannels',
    'player:selectChannel': 'selectChannel',
    'player:moveChannelToTop': 'moveChannelToTop',
    'login:changed': 'loginChanged',
  }
});
var playerStore = new PlayerStore();

// Dipatcher
var Dispatcher = Flux.createDispatcher({
  flash: function( data ) {
    this.dispatch( 'flash', data );
  },
  flashNow: function( data ) {
    this.dispatch( 'flash:now', data );
  },
  showFlash: function() {
    this.dispatch( 'flash:show' );
  },
  loginChanged: function( data ) {
    this.dispatch( 'login:changed', data )
      .then(function() {
        if ( data && data.next ) {
          redirect( data.next );
        }
      });
  },
  loginFailure: function( data ) {
    this.dispatch( 'login:failure', data );
  },
  loadAuthToken: function() {
    this.dispatch( 'auth:loadToken' );
  },
  verifyUser: function( next ) {
    this.dispatch( 'auth:verifyUser ')
      .fail(function() {
        if ( next ) {
          redirect( next );
        }
      });
  },
  accountConfirmed: function( data ) {
    this.dispatch( 'auth:confirmed', data );
  },
  confirmationFailure: function( data ) {
    this.dispatch( 'auth:confirmationFailure', data );
  },
  loadingStream: function( stream_path ) {
    this.dispatch( 'stream:loading', stream_path );
  },
  streamWaiting: function( data ) {
    this.dispatch( 'stream:waiting', data );
  },
  streamChanged: function( data ) {
    this.dispatch( 'stream:changed', data );
  },
  streamFailure: function( data ) {
    this.dispatch( 'stream:failure', data );
  },
  streamStopped: function( data ) {
    this.dispatch( 'stream:stopped', data );
  },
  streamDisconnected: function( data ) {
    this.dispatch( 'stream:disconnected', data );
  },
  nowPlaying: function( data ) {
    this.dispatch( 'stream:nowPlaying', data );
  },
  loadPlayer: function() {
    this.dispatch( 'player:load' );
  },
  playerRegistered: function( data ) {
    this.dispatch( 'player:registered', data );
  },
  playerRegistrationFailure: function( data ) {
    this.dispatch( 'player:registrationFailure', data );
  },
  channelData: function( data ) {
    this.dispatch( 'player:channelData', data )
      .then(function() {
        if ( data.next ) {
          redirect( data.next );
        }
      });
  },
  channelFailure: function( data ) {
    this.dispatch( 'player:channelFailure', data );
  },
  loadChannels: function() {
    this.dispatch( 'player:loadChannels' );
  },
  selectChannel: function( channel_path, media_format ) {
    this.dispatch( 'player:selectChannel', channel_path, media_format );
  },
  moveChannelToTop: function( sourceIndex ) {
    this.dispatch( 'player:moveChannelToTop', sourceIndex );
  },
  signUpStep1: function( data ) {
    this.dispatch( 'signup:step1', data );
  },
  signUpFailure: function( data ) {
    this.dispatch( 'signup:failure', data );
  },
  accountProfile: function( data ) {
    this.dispatch( 'account:profile', data );
  },
  accountUpdated: function( data ) {
    this.dispatch( 'account:updated', data );
  },
  accountFailure: function( data ) {
    this.dispatch( 'account:failure', data );
  },
  passwordResetSent: function( data ) {
    this.dispatch( 'auth:passwordResetSent', data );
  },
  passwordResetFailure: function( data ) {
    this.dispatch( 'auth:passwordResetFailure', data );
  },
  passwordChanged: function( data ) {
    this.dispatch( 'auth:passwordChanged', data );
  },
  passwordFailure: function( data ) {
    this.dispatch( 'auth:passwordFailure', data );
  },
  subscriptionCreated: function( data ) {
    this.dispatch( 'recurly:subscriptionCreated', data );
  },
  subscriptionFailure: function( data ) {
    this.dispatch( 'recurly:subscriptionFailure', data );
  },

  getStores: function() {
    return { 
      flash: flashStore,
      auth: authStore,
      player: playerStore
    };
  }
});

// Action Creators
// Flash messages
var FlashActions = {
  flash: function( data ) {
    Dispatcher.flash( data );
  },
  flashNow: function( data ) {
    Dispatcher.flashNow( data );
  },
  showFlash: function() {
    Dispatcher.showFlash();
  }
};

// Auth actions
var AuthActions = {
  loadAuthToken: function() {
    Dispatcher.loadAuthToken();
  },
  verifyUser: function( next ) {
    Dispatcher.verifyUser( next );
  },
  login: function( data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/auth/login' )
      .accept( 'json' )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.loginChanged( $.extend( { }, res.body, { next: next } ) );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.loginFailure( { status: res.status, error: error } );
        }
      });
  },
  logout: function( next ) {
    Dispatcher.loginChanged( { data: null, next: next } );
  },
  signUpStep1: function( data ) {
    var request = window.superagent;
    request.post( '/api/v1/auth/pre-register' )
      .accept( 'json' )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.signUpStep1( res.body );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.signUpStep1( { status: res.status, error: error, detail: res.body.detail } );
        }
      });
  },
  signUpStep2: function( data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/auth/register' )
      .accept( 'json' )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.loginChanged( $.extend( { }, res.body, { next: next } ) );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.signupFailure( { status: res.status, error: error, detail: res.body.detail } );
        }
      });
  },
  contactUs: function( data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/auth/contact' )
      .accept( 'json' )
      .send( data )
      .end( function( res ) {
        if ( next ) {
          redirect( next );
        }
      });
    },
  sendActivation: function( data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/auth/send-activation' )
      .accept( 'json' )
      .send( data )
      .end( function( res ) {
        if ( next ) {
          redirect( next );
        }
      });
  },
  sendPasswordReset: function( data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/auth/send-password' )
      .accept( 'json' )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.passwordResetSent( $.extend( { }, res.body, { next: next } ) );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.passwordResetFailure( { status: res.status, error: error, detail: res.body.detail } );
        }
      });
  },
  changePassword: function( token, data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/auth/change-password' )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.passwordChanged( $.extend( { }, res.body, { next: next } ) );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.passwordFailure( { status: res.status, error: error, detail: res.body.detail } );
        }
      });
  },
  validateToken: function( data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/auth/validate-token' )
      .accept( 'json' )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.accountConfirmed( $.extend( { }, res.body, { next: next } ) );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.confirmationFailure( { status: res.status, error: error, detail: res.body.detail } );
        }
      });
  },
  getAccountProfile: function( token, next ) {
    var request = window.superagent;
    request.get( '/api/v1/accounts/authenticated' )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.accountProfile( res.body );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.accountFailure( { next: next, status: res.status, error: error } );
        }
      });
  },
  updateAccount: function( token, data, next ) {
    var request = window.superagent;
    request.put( '/api/v1/accounts/authenticated' )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.accountUpdated( $.extend( { }, res.body, { next: next } ) );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.accountFailure( { status: res.status, error: error, detail: res.body.detail } );
        }
      });
  }
};

var PlayerActions = {
  loadPlayer: function() {
    Dispatcher.loadPlayer();
  },
  updateChannels: function( token, media_format ) {
    var request = window.superagent;
    request.get( '/api/v1/accounts/authenticated/channels' )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .query( { media_format: media_format } )
      .end( function( res ) {
        if ( res.ok && !res.body.error && res.body.channels ) {
          Dispatcher.channelData( res.body );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.channelFailure( { status: res.status, error: error } );
        }
      });
  },
  loadChannels: function() {
    Dispatcher.loadChannels();
  },
  saveChannels: function( token, data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/accounts/authenticated/channels' )
      .accept( 'json' )
      .send( data )
      .set( 'Authorization', 'Bearer ' + token )
      .end( function( res ) {
        if ( res.ok && !res.body.error && res.body.channels ) {
          Dispatcher.channelData( $.extend( { }, res.body, { next: next } ) );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.channelFailure( { status: res.status, error: error } );
        }
      });
  },
  selectChannel: function( channel_path, media_format ) {
    Dispatcher.selectChannel( channel_path, media_format );
  },
  moveChannelToTop: function( sourceIndex ) {
    Dispatcher.moveChannelToTop( sourceIndex );
  },
  registerPlayer: function( token, data ) {
    var request = window.superagent;
    request.post( '/api/v1/accounts/authenticated/players' )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error && res.body.player ) {
          Dispatcher.playerRegistered( res.body );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.playerRegistrationFailure( { status: res.status, error: error } );
        }
      });
  },
  loadingStream: function( stream_path ) {
    Dispatcher.loadingStream( stream_path );
  },
  startStream: function( token, stream_path, player_data ) {
    var self = this;
    var request = window.superagent;
    request.post( '/api/v1/streams/' + stream_path )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .send( player_data )
      .end( function( res ) {
        if ( res.ok && !res.body.error && res.body.stream && res.body.stream.path ) {
          stream_path = res.body.stream.path;
          if ( res.body.stream.start_request ) {
            // Stream was kickstarted, check status in 2000ms
            console.log( 'stream ' + stream_path + ' found, waiting for start job' );
            Dispatcher.streamWaiting( res.body );
          } else {
            console.log( 'stream ' + stream_path + ' found, playing: ' + res.body.stream.playing );
            Dispatcher.streamChanged( res.body );
          }
        } else {
          var error = res.body.error || res.text;
          Dispatcher.streamFailure( { status: res.status, error: error, stream: { path: stream_path } } );
        }
      });
  },
  checkStreamStart: function( token, stream_path ) {
    var request = window.superagent;
    request.get( '/api/v1/streams/' + stream_path )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .end( function( res ) {
        if ( res.ok && !res.body.error && res.body.stream ) {
          if ( res.body.stream.playing ) {
            console.log( 'stream ' + res.body.stream.path + ' found and has started' );
            Dispatcher.streamChanged( res.body );
          } else {
            var not_started_error = 'Stream ' + res.body.stream.path + ' has not started playing.';
            Dispatcher.streamFailure( { status: 500, error: not_started_error, stream: { path: stream_path } } );
          }
        } else {
          var error = res.body.error || res.text;
          Dispatcher.streamFailure( { status: res.status, error: error, stream: { path: stream_path } } );
        }
      });
  },
  getNowPlaying: function( stats_url ) {
    var request = window.superagent;
    request.get( stats_url )
      .accept( 'json' )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.nowPlaying( res.body );
        } else {
          // silent error...
        }
      });
  },
  skipSong: function( token, stream_path, player_data ) {
    var request = window.superagent;
    request.post( '/api/v1/streams/' + stream_path + '/skip' )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .send( player_data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          console.log( 'skipSong - streamChanged - index_file is ' + res.body.stream.index_file );
          Dispatcher.streamChanged( res.body );
        } else {
          // Dispatcher.streamFailure( ... );
          console.log( 'skipSong - failed: ' + res.text );
        }
      });
  }
};

var RecurlyActions = {
  placeSubscriptionOrder: function( token, data, next ) {
    var request = window.superagent;
    request.post( '/api/v1/subscriptions' )
      .accept( 'json' )
      .set( 'Authorization', 'Bearer ' + token )
      .send( data )
      .end( function( res ) {
        if ( res.ok && !res.body.error ) {
          Dispatcher.subscriptionCreated( $.extend( { }, res.body, { next: next } ) );
        } else {
          var error = res.body.error || res.text;
          Dispatcher.subscriptionFailure( { status: res.status, error: error } );
        }
      });
  }
};
