__socket_source__

(function() {
    //Gets the default host
    function defaultHost() {
        var host = window.location.protocol + "//" + window.location.hostname;
        if(window.location.port) host += ":" + window.location.port;
        return host;
    }

    //Creates a new stack.io engine
    function Engine(host, options, callback) {
        var self = this;

        if(arguments.length === 1) {
            options = {};

            callback = function(error) {
                if(error) console.error(error);
            };
        } else if(arguments.length === 2) {
            callback = options;
            options = {};
        }

        self.host = host || defaultHost();
        if(self.host.indexOf("http://") != 0 && self.host.indexOf("https://") != 0) {
            self.host = window.location.protocol + "//" + self.host;
        }

        self.options = options;
        self.services = [];
        self.permissions = null;
        self._channelCounter = 0;
        self._channels = {};
        self._socket = io.connect(self.host);

        //If an error occurs and there is no callback, this event will be fired
        self._socket.on("error", function(error) {
            console.error(error);
        });

        //Federates out response events to the appropriate callback
        self._socket.on("response", function(channel, error, result, more) {
            var callback = self._channels[channel];

            if(callback === undefined) {
                console.error("Response receive on closed or non-existent channel " + channel);
            } else {
                callback(error, result, more);
                if(!more) delete self._channels[channel];
            }
        });

        //Initialize the socket
        self._socket.emit("init", self.options, function(error) {
            if(error) return callback(error);

            self._invoke("registrar", "services", function(error, result, more) {
                self.services = result;
                callback(error);
            });
        });
    }

    //Invokes a method
    //service : string
    //      The service name
    //method : string
    //      The method name
    //args... : array
    //      The method arguments
    //callback : function(error : object, result : anything, more : boolean)
    //      The function to call when a result is received
    Engine.prototype._invoke = function(service, method /*, args..., callback*/) {
        if(arguments.length < 3) throw new Error("No callback specified");

        var args = Array.prototype.slice.call(arguments, 2, arguments.length - 1);
        var callback = arguments[arguments.length - 1];

        var channel = this._channelCounter++;
        this._channels[channel] = callback;
        this._socket.emit("invoke", channel, service, method, args);
    };

    //Performs authentication
    //Shorthand for:
    //  client.use("auth", function(error, service) {
    //    service.auth(...);
    //  });
    //args... : array
    //      The method arguments
    //callback : function(error : object, result : anything, more : boolean)
    //      The function to call when a result is received
    Engine.prototype.auth = function(/*args..., callback*/) {
        var args = ["auth", "auth"].concat(Array.prototype.slice.call(arguments));
        this._invoke.apply(this, args);
    };

    //Provides an interface for a service
    //service : string
    //      The service name
    //callback : function(error : object, context : object)
    //      The function to call when the service is ready to be used; context
    //      contains the callable methods
    Engine.prototype.use = function(service, callback) {
        var self = this;

        this._invoke(service, "_zerorpc_inspect", null, null, function(error, result, more) {
            if(error) return callback(error);
            var context = {};

            for(var i=0; i<result.methods.length; i++) {
                (function(method) {
                    context[method] = function() {
                        var args = [service, method].concat(Array.prototype.slice.call(arguments));
                        self._invoke.apply(self, args);
                    };
                })(result.methods[i][0]);
            }

            callback(error, context);
        });
    };

    this.stack = { IO: Engine };
})(this);