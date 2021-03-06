/** This is our main module for the particle web client application */
app = angular.module("ParticleWebClient", ['ngRoute', 'ngStorage', 'angularFileUpload']);

app.directive("filelistBind", function() {
  return function( scope, elm, attrs ) {
    elm.bind("change", function( evt ) {
      //console.log( evt );
      scope.$apply(function( scope ) {
        scope[ attrs.name ] = evt.target.files;
      });
    });
  };
});

/** configure our routes */
app.config(function($routeProvider, $httpProvider) {
    $routeProvider
        // .when('/devices', { templateUrl: 'tpl/devices.tpl.html', resolve:{
        //     authorize: function(loginService) { return loginService.authorize(); }
        // }})
        .when('/devices/:product_id', { templateUrl: 'tpl/devices_new.tpl.html', resolve:{
            authorize: function(loginService) { return loginService.authorize(); }
        }})
        .when('/devices/:product_id/:device_id', { templateUrl: 'tpl/devices_detail.tpl.html', resolve:{
            authorize: function(loginService) { return loginService.authorize(); }
        }})
        .when('/products', { templateUrl: 'tpl/product.tpl.html', resolve:{
            authorize: function(loginService) { return loginService.authorize(); }
        }})
        .when('/firmware/:product_id', { templateUrl: 'tpl/firmware.tpl.html', resolve:{
            authorize: function(loginService) { return loginService.authorize(); }
        }})
        .when('/events', { templateUrl: 'tpl/events.tpl.html', resolve:{
            authorize: function(loginService) { return loginService.authorize(); }
        }})
        .when('/login', { templateUrl: 'tpl/login.tpl.html' })
        .otherwise({ redirectTo: '/login' });


    $httpProvider.interceptors.push('sparkapiInterceptor');

});

/* ************************************************ Sparkapi ******************************************************** */

/** Define the spark api as own implemented service. Functions return promises like $http does. */
app.factory('sparkapi', function($http) {
    baseUrl = 'http://localhost:8080/v1';

    return {
        /** Contains the complete spark token structure as object. */
        token: null,

        /** Handles the token object containing the access_token returned by login.
         * You need to call this function after a successful login. */
        setToken: function(token) {
            this.token = token;
            // tell $http to use the obtained access_token in am authorization header in all requests
            $http.defaults.headers.common.Authorization = 'Bearer ' + token.access_token;
        },

        /** Login with credentials ({username: 'a', pasword: 'b'}) to obtain an access_token inside a token object. */
        login: function(credentials) {
            form_data = {
                username: credentials.username,
                password: credentials.password,
                grant_type: 'password',
                client_id: 'CLI2',
                client_secret: 'client_secret_here'
            };
            return $http({
                method: 'POST',
                transformRequest: function(obj) {
                    var str = [];
                    for(var p in obj)
                        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
                    return str.join("&");
                },
                url: 'http://localhost:8080/oauth/token',
                data: form_data,
                headers: {'Content-Type': 'application/x-www-form-urlencoded'}
            });
        },

        /** Get detailed information about a device given the device id. */
        device: function (deviceId) {
            return $http.get(baseUrl + '/devices/' + deviceId);
        },

        /** Get a list of own devices with few information only. */
        listDevices: function() {
            return $http.get(baseUrl + '/devices');
        },

        /** Call a function for the device with the given device id with the argument(s) given as string. */
        callFunction: function(deviceId, functionName, args) {
            return $http.post(baseUrl + '/devices/' + deviceId + '/' + functionName, {args: args});
        },

        /** Read a variable from the device with the given device id. */
        readVariable: function(deviceId, variableName) {
            return $http.get(baseUrl + '/devices/' + deviceId + '/' + variableName);
        },

        /** Register a handler which will be called for each incoming event from the the device with
         * the given device id.
         * DeviceId can be "mine" to obtain events for all owned devices */
        registerDeviceEvents: function(deviceId, handler) {
            spark.login({accessToken: this.token.access_token});
            spark.getEventStream(false, deviceId,  function(data) {
                if(data.name != 'Error' || data.published_at) {
                    handler.call(this, data);
                } else {
                    console.log('Empty error event filtered.');
                }
            });
        },

        /** Register a handler which will be called for each incoming event from any owned device. */
        registerMineEvents: function(handler) {
            this.registerDeviceEvents('mine', handler);
        },

        publishEvent: function(event) {
            return $http.post(baseUrl + '/devices/events', event);
        },

        products:function(){
            return $http.get(baseUrl + '/products');
        },

        newproductsReq:function(product){
            return $http.post(baseUrl + '/products', product);
        },
        updateproductsReq:function(product, product_id){
            return $http.put(baseUrl + '/products/'+product_id, product);
        },
        deleteproductsReq:function(product_id){
            return $http.delete(baseUrl + '/products/'+product_id);
        },
        devicesByProduct:function(product_id){
            return $http.get(baseUrl + '/products/'+product_id+'/devices');
        },
        newdevicesReq:function(device, product_id){
            return $http.post(baseUrl + '/products/'+product_id+'/devices', device);
        },
        deletedevicesReq:function(product_id, device_id){
            return $http.delete(baseUrl + '/products/'+product_id+'/devices/'+device_id);
        },
        firmwareByProduct:function(product_id){
            return $http.get(baseUrl + '/products/'+product_id+'/firmware');
        },
        newFirmwareReq:function(firmware, file, product_id){
            var fd = new FormData();
            fd.append('binary', file);
            fd.append('version', firmware.version);
            fd.append('title', firmware.title);
            fd.append('current', false);
            fd.append('description', firmware.description);
            return $http.post(baseUrl + '/products/'+product_id+'/firmware', fd,{
                transformRequest: angular.identity,
                headers: {'Content-Type': undefined}
            });
        },

        deleteFirmwareReq:function(product_id, firmware_version){
            return $http.delete(baseUrl + '/products/'+product_id+'/firmware/'+firmware_version);
        },
        releaseFirmwareReq:function(product_id, firmware_version, data){
            return $http.put(baseUrl + '/products/'+product_id+'/firmware/'+firmware_version, data);
        },
        lockFirmwareReq:function(product_id, device_id, data){
            return $http.put(baseUrl + '/products/'+product_id+'/devices/'+device_id, data);
        }

    }
});

/** Handle errors in api calls. */
app.factory('sparkapiInterceptor', function($rootScope, $q) {
    return {
        responseError: function (reject) {
            $rootScope.$broadcast('http_error', reject);
            if (reject.status === 401) {
                console.log("401 intercepted");
                $rootScope.$broadcast('unauthorized');
            }
            return $q.reject(reject.data);
        }
    };
});

/* ************************************************ LoginService **************************************************** */

/** Stores whether the user is logged in or not to keep the GUI up to date. */
app.factory('loginService', function($location, $q, $localStorage) {
    return {
        /** Is the user logged in? */
        loggedIn: false,

        /** Contains the route that the user requested before he was asked to login. */
        nextRoute: '/products',

        /** Look for an existing access-token in the $localstorage (HTML5 storage in browser) */
        init: function() {
            if($localStorage.token) {
                this.loggedIn = true;
                return $localStorage.token;
            } else {
                this.loggedIn = false;
                return false;
            }
        },

        /** Set login status to logged in and store the token if desired (store is true). */
        login: function(token, store) {
            this.loggedIn = true;
            if(store) {
                $localStorage.token = token;
            }
        },

        /** Set the state to logged out */
        logout: function() {
            this.loggedIn = false;
            if($localStorage.token) {
                $localStorage.token = false;
            }
        },

        /** This function should be used in "authorize" for route changes. */
        authorize: function() {
            if(this.loggedIn) {
                return true;
            } else {
                // reject the route
                // nextRoute must be set in the error handler
                return $q.reject('Not Authenticated');
            }
        }

    };
});

/* ************************************************ NavibarCtr ****************************************************** */

/** This controller is responsible for the navigation. It is used to highlight the active page and some more. */
app.controller('NavibarCtrl', ['$rootScope', '$scope', '$location', 'loginService', function($rootScope, $scope, $location, loginService) {
    $scope.loginService = loginService;
    /** Redirect to /login if the route change failed bevause of an login error. */
    $rootScope.$on("$routeChangeError", function(event, nextRoute, currentRoute) {
        // redirect to login
        $location.path('/login');

        console.log(nextRoute.params);
        // save the desired route to redirect to it after login
        loginService.nextRoute = nextRoute.originalPath;
    });

    /** Return true if the given path is the currently displayed one. */
    $scope.isActive = function(path) {
        return ($location.path().substr(0, path.length) === path) ? 'active' : false;
    };

    /** Log the current user out and redirect to login form. */
    $scope.logout = function() {
        if(loginService.loggedIn) {
            loginService.logout();
            $location.path('/login');
        }
    };

    $rootScope.$on('unauthorized', function() {
        $scope.logout();
    });
}]);

/* ************************************************ ErrorCtr ******************************************************** */

/** This controller displays errors on the main layout */
app.controller('ErrorCtrl', ['$rootScope', '$scope', '$location', 'loginService', function($rootScope, $scope) {
    $scope.message = "";

    $scope.clear = function() {
        $scope.message = "";
    };

    $rootScope.$on('http_error', function(event, httperror) {
        var sparkerror = httperror.data;
        var message = httperror.statusText + ' (' + httperror.status + ')';
        if(sparkerror && sparkerror.error_description) {
             message += " - " + sparkerror.error_description;
        }
        $scope.message = message;
    });

}]);

/* ************************************************ LoginCtr ******************************************************** */

/** The login controller handles the sign-in form */
app.controller('LoginCtrl', ['$scope', '$location', '$localStorage', 'sparkapi', 'loginService', function($scope, $location, $localStorage, sparkapi, loginService) {

    /** Make an api call to the particle cloud to obtain an access token */
    $scope.login = function(credentials) {
        sparkapi.login(credentials).then(
            function(response) {
                token = response.data;
                console.log('Obtained access-token: ', token.access_token);
                loginService.login(token, $scope.rememberMe);
                $scope.handleSuccessfulLogin(token);
            },
            function(err) { }
        );
    };

    /** maybe, the user has already logged in before and a access_token is stored? */
    $scope.tryAutoLogon = function() {
        var token = loginService.init();
        if (token && token.access_token) {
            $scope.handleSuccessfulLogin(token);
        }
    };

    /** use the obtained token for the particle api and redirect to the desired path */
    $scope.handleSuccessfulLogin = function (token) {
        sparkapi.setToken(token);
        $location.path(loginService.nextRoute);
    };

    $scope.tryAutoLogon();
}]);

/* ************************************************ DevicesCtr ****************************************************** */

/** The devices controller handles the devices page with possibilities to get variables, call functions and show device events. */
app.controller('DevicesCtrl', ['$scope', 'loginService', 'sparkapi', function($scope, loginService, sparkapi) {

    /** Query the device list from the api, then query details for each device and store that information in the scope. */
    $scope.list = function() {
        $scope.devices = [];
        sparkapi.listDevices().then(
            function(result){
                //console.log('API call completed on promise resolve: ', devices);
                //$scope.devices = result.data;
                angular.forEach(result.data, function(deviceEntry) {
                    var deviceIndex = null;
                    sparkapi.device(deviceEntry.id).then(
                        function(result) {
                            deviceIndex = $scope.devices.push(result.data) - 1;
                            console.log(result.data);
                        },
                        function(error) {}
                    );

                    $scope.events[deviceEntry.id] = [];
                    sparkapi.registerDeviceEvents(deviceEntry.id, function(data) {
                        $scope.$apply(function() {
                            //console.log(data);
                            $scope.events[deviceEntry.id].push(data);
                            while($scope.events[deviceEntry.id].length > 10) {
                                $scope.events[deviceEntry.id].shift();
                            }

                            if(data.name == 'spark/status') {
                                //reload
                                sparkapi.device(deviceEntry.id).then(
                                    function(result) {
                                        if (deviceIndex != null) {
                                            $scope.devices[deviceIndex] = result.data;
                                            console.log(result.data);
                                        }
                                    },
                                    function(error) {}
                                );
                            }
                        });
                    })
                });
            },
            function(err) {
                console.log('API call completed on promise fail: ', err);
                //$scope.errors[err.message] = true;
                $scope.error = err.message;
            }
        );
    };

    /** Call a function using the api and store the result in $scope.functionResults. */
    $scope.callFunction = function(deviceId, functionName, params) {
        console.log("Calling " + functionName + '(' + params + ')');
        sparkapi.callFunction(deviceId, functionName, params).then(
            function(result) {
                $scope.functionResults[deviceId + functionName] = result.data.return_value;
            },
            function(error) {}
        );
    };

    /** Query a variable via api and store the result in $scope.variableValues. */
    $scope.readVariable = function(deviceId, variableName) {
        console.log("Reading " + variableName);
        sparkapi.readVariable(deviceId, variableName).then(
            function(result) {
                $scope.variableValues[deviceId + variableName] = result.data.result;
            },
            function(error) {}
        )
    };

    /** Reset the $scope. */
    $scope.clear = function() {
        $scope.functionResults = {};
        $scope.functionArgs = {};
        $scope.variableValues = {};
        $scope.events = {};
    };

    $scope.clear();
    $scope.list();

}]);

/* ************************************************ EventsCtr ******************************************************* */

/** The events controller handles events for all owned devices or those sent via rest api call and filters them. */
app.controller('EventsCtr', ['$scope', 'loginService', 'sparkapi', function($scope, loginService, sparkapi) {

    /** Tell the api what to do if a event is triggered: Store it in $scope.events. */
    $scope.registerHandler = function() {
        sparkapi.registerMineEvents(function(data) {
            $scope.$apply(function() {
                data.deviceName = $scope.getName(data.coreid);
                $scope.events.unshift(data);
                while ($scope.events.length > 1000) {
                    $scope.events.pop();
                }
            });
        });
    };

    /** Load devices from API. This is important to display the human readable names for devices instead of their ids. */
    $scope.loadDevices = function () {
        sparkapi.listDevices().then(
            function(response){
                angular.forEach(response.data, function(deviceEntry) {
                    $scope.devices[deviceEntry.id] = deviceEntry.name;
                });
            },
            function(error){ }
        );
    };

    /** Translate device ids into names if "loadDevices" was successful before. */
    $scope.getName = function(deviceId) {
        if($scope.devices.hasOwnProperty(deviceId)) {
            return $scope.devices[deviceId];
        } else {
            return deviceId;
        }
    };
    
    $scope.publishEvent = function (event) {
        sparkapi.publishEvent(event);
    };

    /** Reset the $scope. */
    $scope.clear = function() {
        $scope.events = [];

        // If a event is created i.e. by a pc calling the rest web api, it will origin from the device with id '001'.
        // As the (virtual) device '001' won't appear in the device list, we need to add a name for it.
        $scope.devices = { '001': 'Web API'};

        // each filters can be cleared seperately in a function
        $scope.clearDeviceFilters();
        $scope.clearNameFilter();
        $scope.clearDataFilter();

        // init publish form
        $scope.clearPublishForm();

        $scope.loadDevices();
    };

    /** reset the device filters */
    $scope.clearDeviceFilters = function() {
        $scope.deviceFilters = {};
    };

    /** reset the name filter */
    $scope.clearNameFilter = function() {
        $scope.nameFilter = {method: 'contains'};
    };

    /** reset the data filter  */
    $scope.clearDataFilter = function() {
        $scope.dataFilter = {method: 'contains'};
    };

    $scope.clearPublishForm = function() {
        $scope.eventform = { name: "", data: "", private: true};
    };

    /** Return true if any field in the object ist true. This is used to see if at least one checkbox is checked. */
    $scope.anyFieldTrue = function(object) {
        var oneFieldIsTrue = false;
        angular.forEach(object, function(value, key) {
            if(value == true) {
                oneFieldIsTrue = true;
            }
        });
        return oneFieldIsTrue;
    };

    $scope.clear();
    $scope.registerHandler();
}]);

/** This flter searches for strings in a list of objects. The field of the compared object can be selected and
 * the method of comparison can be "equals", "contains" or "regex".
 */
app.filter('advSearch', function($filter) {
    var filterFilter = $filter('filter');

    return function(input, expression, field) {
        // return unchangedinput if no search text is present
        if(!(expression && expression.text && expression.text.length > 0)) { return input; }

        var filter_expression;
        if(field) {
            filter_expression = {};
            filter_expression[field] = expression.text;
        } else {
            filter_expression = expression.text;
        }

        var comperator;
        if(expression.method == 'regex') {
            comperator = function(actual, expected) {
                return (actual.search(new RegExp(expected, "i")) >= 0);
            };
        } else if(expression.method == 'equals') {
            comperator = true;
        } else {
            // contains
            comperator = false;
        }

        return filterFilter(input, filter_expression, comperator);
    };
});

/** This shows only entries that are queal to one value in a list of values. **/
app.filter('enumFilter', function($filter) {
    var filterFilter = $filter('filter');

    return function(input, enums, field) {
        // return unchangedinput if no search text is present
        if(!enums) { return input; }

        // do not filter anything if no checkboxes are selected
        var showEntries = [];
        angular.forEach(enums, function(show, entryName) {
            if(show) { showEntries.push(entryName); }
        });
        if(showEntries.length == 0) { return input; }

        var filter_expression;
        if(field) {
            filter_expression = {};
            filter_expression[field] = enums;
        } else {
            filter_expression = enums;
        }

        var comperator = function(actual, expected) {
            //return actual.search(expected) > 0;
            console.log(expected);
            return expected[actual] == true;
        };
        return filterFilter(input, filter_expression, comperator);
    };
});






/* ************************************************ ProductCtr ******************************************************* */

/** The events controller handles events for all owned devices or those sent via rest api call and filters them. */
app.controller('ProductCtrl', ['$scope', 'loginService', 'sparkapi', function($scope, loginService, sparkapi) {
    $scope.products = {};
    sparkapi.products().then(function(result){
        $scope.products = result.data.products;;
    });

    $scope.new_products = {};

    $scope.newProducts = function(newp) {
        if(newp && newp.platform_id && newp.name){
            newp.type = "Consumer";
            console.log(newp);
            newp.platform_id = parseInt(newp.platform_id);
            var request = {"product":newp};
            console.log(request);
            sparkapi.newproductsReq(request).then(function(result){
                sparkapi.products().then(function(result){
                    $scope.products = result.data.products;
                });
            });
        }else return;
    };

    $scope.updateProducts = function(updatedProduct) {
        if(updatedProduct && updatedProduct.platform_id && updatedProduct.name){
            var request = {"product":updatedProduct};
            console.log(request);
            sparkapi.updateproductsReq(request, updatedProduct.slug).then(function(result){
                console.log(result);
                sparkapi.products().then(function(result){
                    $scope.products = result.data.products;
                });
            });
        }else return;
    };

    $scope.deleteProducts = function(product_id) {
        console.log(product_id);
        if(product_id){
            sparkapi.deleteproductsReq(product_id).then(function(result){
                console.log(result);
                sparkapi.products().then(function(result){
                    $scope.products = result.data.products;
                });
            });
        }else return;
    };
}]);

/* ************************************************ DevicesCtr ****************************************************** */

/** The devices controller handles the devices page with possibilities to get variables, call functions and show device events. */
app.controller('DeviceNewCtrl', ['$scope', '$routeParams', 'loginService', 'sparkapi', function($scope, $routeParams, loginService, sparkapi) {
    $scope.selected_product_id = $routeParams.product_id;
    $scope.devices = {};
    $scope.new_device = {};
    sparkapi.devicesByProduct($scope.selected_product_id).then(function(result){
        $scope.devices = result.data.devices;
    });

    $scope.newDevice = function(newd) {
        if(newd && newd.id){
            newd.import_method = "one";
            sparkapi.newdevicesReq(newd, $scope.selected_product_id).then(function(result){
                sparkapi.devicesByProduct($scope.selected_product_id).then(function(result){
                    $scope.devices = result.data.devices;
                });
            });
        }
    };


    $scope.updateDevice = function(updatedDevice) {
        if(updatedDevice && updatedDevice.id){
            
        }else return;
    };

    $scope.deleteDevice = function(device_id) {
        console.log(device_id);
        if(device_id){
            sparkapi.deletedevicesReq($scope.selected_product_id, device_id).then(function(result){
                sparkapi.devicesByProduct($scope.selected_product_id).then(function(result){
                    $scope.devices = result.data.devices;
                });
            });
        }else return;
    };
}]);

/* ************************************************ FirmwareCtr ****************************************************** */

/** The devices controller handles the devices page with possibilities to get variables, call functions and show device events. */
app.controller('FirmwareCtrl', ['$scope', '$routeParams', 'loginService', 'sparkapi', function($scope, $routeParams, loginService, sparkapi) {
    $scope.selected_product_id = $routeParams.product_id;
    $scope.firmwares = {};
    $scope.new_firmware = {};
    sparkapi.firmwareByProduct($scope.selected_product_id).then(function(result){
        $scope.firmwares = result.data;
    });
    $scope.files = [];
    $scope.newFirmware = function(newf) {
        var file = $scope.files[0];
        console.log(file);
        console.log(newf);
        sparkapi.newFirmwareReq(newf, file, $scope.selected_product_id).then(function(result){
            sparkapi.firmwareByProduct($scope.selected_product_id).then(function(result){
                $scope.firmwares = result.data;
            });
        });
    };

    $scope.deleteFirmware = function(firmware_version){
        if(firmware_version){
            sparkapi.deleteFirmwareReq($scope.selected_product_id, firmware_version).then(function(result){
                sparkapi.firmwareByProduct($scope.selected_product_id).then(function(result){
                    $scope.firmwares = result.data;
                });
            });
        }else return;
    };

    $scope.releaseFirmware = function(firmware, current){
        if(firmware){
            firmware.current = current;
            sparkapi.releaseFirmwareReq($scope.selected_product_id, firmware.version, firmware).then(function(result){
                sparkapi.firmwareByProduct($scope.selected_product_id).then(function(result){
                    $scope.firmwares = result.data;
                });
            });
        }else return;
    };

}]);

/* ************************************************ DevicesDetailCtrl ****************************************************** */

/** The devices controller handles the devices page with possibilities to get variables, call functions and show device events. */
app.controller('DevicesDetailCtrl', ['$scope', '$routeParams', 'loginService', 'sparkapi', function($scope, $routeParams, loginService, sparkapi) {
    $scope.selected_product_id = $routeParams.product_id;
    $scope.selected_device_id = $routeParams.device_id;
    $scope.devicesNew = [];
    $scope.device_events = {};
    $scope.device_events[$scope.selected_device_id] = [];

    sparkapi.device($scope.selected_device_id).then(function(result) {
        $scope.devicesNew.push(result.data);
    });

    if(!$scope.firmwares || !($scope.firmwares.length > 0)){
        sparkapi.firmwareByProduct($scope.selected_product_id).then(function(result){
            $scope.firmwares = result.data;
        });
    }
    
    sparkapi.registerDeviceEvents($scope.selected_device_id, function(data) {
        $scope.$apply(function() {
            // console.log(data);
            $scope.device_events[$scope.selected_device_id].push(data);
            while($scope.device_events[$scope.selected_device_id].length > 10) {
                $scope.device_events[$scope.selected_device_id].shift();
            }

            if(data.name == 'spark/status') {
                try{
                    $scope.devicesNew.forEach(function(div){
                        if(div.id == $scope.selected_device_id){
                            if(data.data == 'online'){
                                div.connected = true;
                            }else if(data.data == 'offline'){
                                div.connected = false;
                            }
                        }
                    });
                }catch(e){}
            }
        });
    });

    $scope.isFirmwareEdit = false;
    $scope.editFirmware = function(){
        $scope.isFirmwareEdit = true;
    };
    $scope.lockFirmware = function(selectedFirmware){
        $scope.isFirmwareEdit = false;
        if(selectedFirmware){
            // lockFirmwareReq:function(product_id, device_id, data){
            var data = {"desired_firmware_version": selectedFirmware};
            sparkapi.lockFirmwareReq($scope.selected_product_id, $scope.selected_device_id, data).then(function(result){
                console.log(result);
                sparkapi.device($scope.selected_device_id).then(function(result) {
                    $scope.devicesNew = [];
                    $scope.devicesNew.push(result.data);
                });
            });
        }
    };
    $scope.cancelFirmware = function(){
        $scope.isFirmwareEdit = false;
    };

}]);
