angular
    .module('bit.vault')

    .controller('vaultViewLoginController', function ($scope, $state, $stateParams, loginService, toastr, $q,
        $analytics, i18nService, utilsService, totpService, $timeout, tokenService, $window, cryptoService, SweetAlert,
        constantsService) {
        $scope.constants = constantsService;
        $scope.i18n = i18nService;
        $scope.showAttachments = !utilsService.isEdge();
        var from = $stateParams.from,
            totpInterval = null;

        $scope.isPremium = tokenService.getPremium();
        $scope.login = null;
        loginService.get($stateParams.loginId, function (login) {
            if (!login) {
                return;
            }

            $q.when(login.decrypt()).then(function (model) {
                $scope.login = model;

                if (model.password) {
                    $scope.login.maskedPassword = $scope.maskValue(model.password);
                }

                if (model.uri) {
                    $scope.login.showLaunch = model.uri.startsWith('http://') || model.uri.startsWith('https://');
                    var domain = utilsService.getDomain(model.uri);
                    if (domain) {
                        $scope.login.website = domain;
                    }
                    else {
                        $scope.login.website = model.uri;
                    }
                }
                else {
                    $scope.login.showLaunch = false;
                }

                if (model.totp && (login.organizationUseTotp || tokenService.getPremium())) {
                    totpUpdateCode();
                    totpTick();

                    if (totpInterval) {
                        clearInterval(totpInterval);
                    }

                    totpInterval = setInterval(function () {
                        totpTick();
                    }, 1000);
                }
            });
        });

        $scope.edit = function (login) {
            $state.go('editLogin', {
                animation: 'in-slide-up',
                loginId: login.id,
                fromView: true,
                from: from
            });
        };

        $scope.toggleFieldValue = function (field) {
            field.showValue = !field.showValue;
        };

        $scope.close = function () {
            if (from === 'current') {
                $state.go('tabs.current', {
                    animation: 'out-slide-down'
                });
            }
            else if (from === 'folder') {
                $state.go('viewFolder', {
                    animation: 'out-slide-down'
                });
            }
            else {
                $state.go('tabs.vault', {
                    animation: 'out-slide-down'
                });
            }
        };

        $scope.launchWebsite = function (login) {
            if (login.showLaunch) {
                $analytics.eventTrack('Launched Website');
                chrome.tabs.create({ url: login.uri });
            }
        };

        $scope.clipboardError = function (e, password) {
            toastr.info(i18n.browserNotSupportClipboard);
        };

        $scope.maskValue = function (value) {
            if (!value) {
                return value;
            }

            var masked = '';
            for (var i = 0; i < value.length; i++) {
                masked += '•';
            }
            return masked;
        };

        $scope.clipboardSuccess = function (e, type) {
            e.clearSelection();
            $analytics.eventTrack('Copied ' + (type === i18nService.username ? 'Username' : 'Password'));
            toastr.info(type + i18nService.valueCopied);
        };

        $scope.showPassword = false;
        $scope.togglePassword = function () {
            $analytics.eventTrack('Toggled Password');
            $scope.showPassword = !$scope.showPassword;
        };

        $scope.download = function (attachment) {
            if (!$scope.login.organizationId && !tokenService.getPremium()) {
                SweetAlert.swal({
                    title: i18nService.premiumRequired,
                    text: i18nService.premiumRequiredDesc,
                    showCancelButton: true,
                    confirmButtonText: i18nService.learnMore,
                    cancelButtonText: i18nService.cancel
                }, function (confirmed) {
                    if (confirmed) {
                        chrome.tabs.create({ url: 'https://bitwarden.com' });
                    }
                });
                return;
            }

            if (attachment.downloading) {
                return;
            }

            attachment.downloading = true;
            var req = new XMLHttpRequest();
            req.open('GET', attachment.url, true);
            req.responseType = 'arraybuffer';
            req.onload = function (evt) {
                if (!req.response) {
                    toastr.error(i18n.errorsOccurred);
                    $timeout(function () {
                        attachment.downloading = false;
                    });
                    return;
                }

                cryptoService.getOrgKey($scope.login.organizationId).then(function (key) {
                    return cryptoService.decryptFromBytes(req.response, key);
                }).then(function (decBuf) {
                    var blob = new Blob([decBuf]);

                    if ($window.navigator.msSaveOrOpenBlob) {
                        // Currently bugged in Edge. See
                        // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8178877/
                        // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8477778/
                        $window.navigator.msSaveBlob(csvBlob, attachment.fileName);
                    }
                    else {
                        var a = $window.document.createElement('a');
                        a.href = $window.URL.createObjectURL(blob);
                        a.download = attachment.fileName;
                        $window.document.body.appendChild(a);
                        a.click();
                        $window.document.body.removeChild(a);
                    }

                    $timeout(function () {
                        attachment.downloading = false;
                    });
                }, function () {
                    toastr.error(i18n.errorsOccurred);
                    $timeout(function () {
                        attachment.downloading = false;
                    });
                });
            };
            req.send(null);
        };

        $scope.$on("$destroy", function () {
            if (totpInterval) {
                clearInterval(totpInterval);
            }
        });

        function totpUpdateCode() {
            if (!$scope.login.totp) {
                return;
            }

            totpService.getCode($scope.login.totp).then(function (code) {
                $timeout(function () {
                    if (code) {
                        $scope.totpCodeFormatted = code.substring(0, 3) + ' ' + code.substring(3);
                        $scope.totpCode = code;
                    }
                    else {
                        $scope.totpCode = $scope.totpCodeFormatted = null;
                        if (totpInterval) {
                            clearInterval(totpInterval);
                        }
                    }
                });
            });
        }

        function totpTick() {
            $timeout(function () {
                var epoch = Math.round(new Date().getTime() / 1000.0);
                var mod = epoch % 30;
                var sec = 30 - mod;

                $scope.totpSec = sec;
                $scope.totpDash = (2.62 * mod).toFixed(2);
                $scope.totpLow = sec <= 7;
                if (mod === 0) {
                    totpUpdateCode();
                }
            });
        }
    });
