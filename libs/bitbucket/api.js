const axios = require('axios')
require('dotenv').config()

axios.interceptors.request.use(function (config) {
    config.headers.Authorization = 'Bearer ' + process.env.BITBUCKET_TOKEN;
    return config;
});

function bitbucketPrApi() {
    axios.defaults.baseURL = process.env.BITBUCKET_PR_API
    return axios
}

function bitbucketGitApi() {
    axios.defaults.baseURL = process.env.BITBUCKET_PR_GIT_API
    return axios
}

module.exports = {
    bitbucketPrApi,
    bitbucketGitApi
}