import { Component, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import * as mockPlaylistItems from './mockPlaylistItems.json';
import * as mockPlaylists from './mockPlaylists.json';
import * as $ from 'jquery';
import { UtilsService } from './utils.service';
let moment = require('moment');
const momentDurationFormatSetup = require("moment-duration-format");

/**
 * @App_name Youtube Playlist Player
 * @Author Emile Li
 */
const THIRD_COLOR = '#FFFFFF80';
@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit {
	// Read runtime-injected environment variables from window.__env (provided by server at /env.js)
	// privateEnv = (window as any).__env || {};
	// API_KEY = this.privateEnv.API_KEY;
	// CLIENT_ID = this.privateEnv.CLIENT_ID;
	// API_KEY = '';
	// CLIENT_ID = '';
	SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
	DISCOVERY_URL = 'https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest';
	GoogleAuth: any;
	allPlaylists = [];
	currentPlaylistItems = [];
	currentPlaylist: any;
	channelInfo = {id: '', title: '', thumbnail: ''};
	userProfile = {firstName: "", lastName: "", imageUrl: "", email: ""};
	currentlyPlaying = {videoId: "", title: "", duration: "", thumbnail: ""};
	previousSong = {videoId: "", title: "", duration: "", thumbnail: ""};
	YOUTUBE_PLAYER: any;
	currentEndTime: number;
	timer: any;
	playing: boolean;
	shuffleEnabled = false;
	loopEnabled = false;
	channelResults: any;
	justLoaded = true;
	currentPlaylistId = "";

	constructor(private cdr: ChangeDetectorRef, private utilsService: UtilsService) { momentDurationFormatSetup(moment); }

	ngOnInit() {
		// this.utilsService.getEnv().subscribe((response) => {
		// 	this.API_KEY = response.body.API_KEY;
		// 	this.CLIENT_ID = response.body.CLIENT_ID;
		// });

		localStorage.getItem('channelId') ? this.channelInfo.id = localStorage.getItem('channelId') : null;
		localStorage.getItem('channelTitle') ? this.channelInfo.title = localStorage.getItem('channelTitle') : null;
		localStorage.getItem('channelThumbnail') ? this.channelInfo.thumbnail = localStorage.getItem('channelThumbnail') : null;
		localStorage.getItem('allPlaylists') ? this.allPlaylists = JSON.parse(localStorage.getItem('allPlaylists')) : null;
		localStorage.getItem('currentPlaylist') ? this.currentPlaylist = JSON.parse(localStorage.getItem('currentPlaylist')) : null;
		localStorage.getItem('currentPlaylistItems') ? this.currentPlaylistItems = JSON.parse(localStorage.getItem('currentPlaylistItems')) : null;
		localStorage.getItem('currentlyPlaying') ? this.currentlyPlaying = JSON.parse(localStorage.getItem('currentlyPlaying')) : null;

		$('.playlist-items-container').css({display: 'none'});
		$('.loader-container').css({display: 'block'});

		$(".search-bar").keypress((event) => {
			if (event.keyCode == 13) {
				$(".search-button").click();
			}
		});

		// if (performance.navigation.type == performance.navigation.TYPE_RELOAD) {
		// 	confirm('You are about to reload the page and the state of your playlists!!');
		// }

		this.utilsService.getEnv().subscribe((response) => {
			const API_KEY = response.body.API_KEY;
			const CLIENT_ID = response.body.CLIENT_ID;
			this.loadClient(API_KEY, CLIENT_ID);
		});
	}

	ngAfterViewInit() {
		setTimeout(() => {
			if (this.currentlyPlaying.videoId != '') {
				$(`#${this.currentlyPlaying.videoId}-row-container`).addClass('active');
			}
		}, 1000);
	}

	loadClient(apiKey, clientId) {
		// Load the API's client and auth2 modules.
		gapi.load('client:auth2', () => {
			// Initialize the gapi.client object, which app uses to make API requests.
			// Get API key and client ID from API // console.
			gapi.client.init({
				'apiKey': apiKey,
				'clientId': clientId,
				'discoveryDocs': [this.DISCOVERY_URL],
				'scope': this.SCOPE
		  	}).then(() => {
				this.GoogleAuth = gapi.auth2.getAuthInstance();

				// Handle initial sign-in state. (Determine if user is already signed in.)
				this.setSignInStatus();

				$('.sign-in-button').click(async () => { // handles sign-in button
					await this.GoogleAuth.signIn().then(() => { // wait for user to sign in
						$('.sign-in-button').css({display: 'none'});
						this.resetLocalStorage();
						window.location.reload();
					});
				});

				$('.logout-button').click(() => { // handles logout button
					if (this.GoogleAuth.isSignedIn.get()) {
						this.resetLocalStorage();
						this.GoogleAuth.signOut();
						window.location.reload();
					}
				});
		  	});
		});
	}

	displayErrorMsg() {
		console.error("setDurationsAndArtists: Daily API Requests Limit Exceeded");
		$('.playlist-items-container').html(`
			<div style='padding: 20px 8px; text-align: center;'>
				Daily API Requests Limit Exceeded
				<p>Retry After 12:00AM Pacific Time</p>
			</div>
		`);
		this.resetLocalStorage();
	}

	resetLocalStorage() {
		localStorage.setItem('channelId', '');
		localStorage.setItem('channelTitle', '');
		localStorage.setItem('channelThumbnail', '');
		localStorage.setItem('allPlaylists', '');
		localStorage.setItem('currentPlaylist', '');
		localStorage.setItem('currentPlaylistItems', '');
		localStorage.setItem('currentlyPlaying', '');
	}

	setSignInStatus() {
		const user = this.GoogleAuth.currentUser.get(),
			isAuthorized = user.hasGrantedScopes(this.SCOPE);
		if (isAuthorized) { // check if signed-in
			if (this.GoogleAuth && this.GoogleAuth.isSignedIn.get()) { // setting up signed-in user icon area if signed in
				let profile = this.GoogleAuth.currentUser.get().getBasicProfile();
				this.userProfile.firstName = profile.getGivenName();
				this.userProfile.lastName = profile.getFamilyName();
				this.userProfile.imageUrl = profile.getImageUrl();
				this.userProfile.email = profile.getEmail();
				$(".user-icon-dropdown-button").html(`
					<img class='user-img' src='${this.userProfile.imageUrl}'>
					<style>
						.user-img {width: 23px; height: 23px; border-radius: 50%;}
					</style>
				`);
			}
			$('.user-icon-dropdown').css({display: 'inline-block'});
			// console.log('SIGNED IN');
			if (this.allPlaylists.length == 0) { // check for locally stored data
				this.setUpPlaylists('');
			} else { // use locally stored data for optimization
				// console.log('ALL PLAYLISTS', this.allPlaylists);
				// console.log('CURRENT PLAYLIST:', this.currentPlaylist.snippet.title);
				// console.log('CURRENT PLAYLIST ITEMS', this.currentPlaylistItems);
				$('.all-playlists-dropdown-button').html(`
					<div class='no-overflow'>${this.currentPlaylist.snippet.title}<div>
					<style>
						.no-overflow {text-overflow: ellipsis; overflow: hidden; white-space: nowrap;}
					</style>
				`);
				$('.all-playlists-dropdown-button').css({display: 'flex'});
				this.cdr.detectChanges();
				$(`#${this.currentPlaylist.id}`).css({color: 'grey'});
				this.currentPlaylistId = this.currentPlaylist.id;
				this.setDurationsAndArtists().then(()=> {
					$('.loader-container').css({display: 'none'});
					$('.playlist-items-container').css({display: 'block'});
					if (this.currentlyPlaying) {
						this.buildAudioPlayer(this.currentlyPlaying.videoId, this.currentlyPlaying.duration, this.currentlyPlaying.title, this.currentlyPlaying.thumbnail, false);
					}
					this.cdr.detectChanges();
				});
			}
		} else { // check for registered channel
			$('.sign-in-button').css({display: 'inline-block'});
			// console.log('SIGNED OUT');
			if (this.channelInfo.id != '') { // channel registered
				$('.channel-icon-dropdown').css({display: 'inline-block'});
				if (this.allPlaylists.length == 0) { // check for locally stored data
					this.setUpPlaylists(this.channelInfo.id);
				} else { // use locally stored data for optimization
					// console.log('ALL PLAYLISTS', this.allPlaylists);
					// console.log('CURRENT PLAYLIST:', this.currentPlaylist.snippet.title);
					// console.log('CURRENT PLAYLIST ITEMS', this.currentPlaylistItems);
					$('.all-playlists-dropdown-button').html(`
						<div class='no-overflow'>${this.currentPlaylist.snippet.title}<div>
						<style>
							.no-overflow {text-overflow: ellipsis; overflow: hidden; white-space: nowrap;}
						</style>
					`);
					$('.all-playlists-dropdown-button').css({display: 'flex'});
					$(`#${this.currentPlaylist.id}`).css({color: 'grey'});
					this.currentPlaylistId = this.currentPlaylist.id;
					this.setDurationsAndArtists().then(()=> {
						$('.loader-container').css({display: 'none'});
						$('.playlist-items-container').css({display: 'block'});
						if (this.currentlyPlaying) {
							this.buildAudioPlayer(this.currentlyPlaying.videoId, this.currentlyPlaying.duration, this.currentlyPlaying.title, this.currentlyPlaying.thumbnail, false);
						}
						this.cdr.detectChanges();
					});
				}
			} else { // not signed-in and no channel registered
				this.resetLocalStorage();
				$('.loader-container').css({display: 'none'});
				$('.playlist-items-container').css({display: 'block'});
				$('.playlist-items-container').html(`
				 	<div class='container'>
						Sign in to your youtube account or search a youtube channel and the corresponding playlists will appear here.
					</div>
					<style>
						.container {padding: 20px 220px; text-align: center;}
						@media screen and (max-width: 768px) {.container {padding: 20px 8px;}}
						@media screen and (max-width: 425px) {.container {padding: 20px 22px;}}
					</style>
				`);
			}
		}
	}

	useMockData() {
		this.allPlaylists = mockPlaylists.items;
		this.currentPlaylist = this.allPlaylists[0];
		$('.all-playlists-dropdown-button').html(`
			<div class='no-overflow'>${this.currentPlaylist.snippet.title}<div>
			<style>
				.no-overflow {text-overflow: ellipsis; overflow: hidden; white-space: nowrap;}
			</style>
		`);
		$('.all-playlists-dropdown-button').css({display: 'flex'});
		this.currentPlaylistItems = mockPlaylistItems[0].items;
		for (let i = 0, len = this.currentPlaylistItems.length; i < len; i++) {
			this.currentPlaylistItems[i].contentDetails.duration = "PT1M20S";
			this.currentPlaylistItems[i].snippet.title = this.currentPlaylistItems[i].snippet.title.concat('___' + 'default artist');
		}
		if (this.currentlyPlaying) {
			this.buildAudioPlayer(this.currentlyPlaying.videoId, this.currentlyPlaying.duration, this.currentlyPlaying.title, this.currentlyPlaying.thumbnail, false);
		}
		this.cdr.detectChanges();
	}

	setUpPlaylists(channelId) {
		// to use the mock data, comment out everything under it within the function.
		// this.useMockData();
		$('.playlist-items-container').css({display: 'none'});
		$('.loader-container').css({display: 'block'});
		this.getAllPlaylists(channelId).then(() => {
			if (this.allPlaylists.length != 0) {
				this.currentPlaylist = this.allPlaylists[0];
				// console.log('CURRENT PLAYLIST:', this.currentPlaylist.snippet.title);
				localStorage.setItem('currentPlaylist', JSON.stringify(this.currentPlaylist));
				$('.all-playlists-dropdown-button').html(`
					<div class='no-overflow'>${this.currentPlaylist.snippet.title}<div>
					<style>
						.no-overflow {text-overflow: ellipsis; overflow: hidden; white-space: nowrap;}
					</style>
				`);
				$('.all-playlists-dropdown-button').css({display: 'flex'});
				this.cdr.detectChanges();
				$(`#${this.currentPlaylist.id}`).css({color: 'grey'});
				this.currentPlaylistId = this.currentPlaylist.id;
				this.getPlaylistItems(this.currentPlaylist.id).then(() => {
					this.setDurationsAndArtists().then(()=> {
						$('.loader-container').css({display: 'none'});
						$('.playlist-items-container').css({display: 'block'});
						if (this.currentlyPlaying) {
							this.buildAudioPlayer(this.currentlyPlaying.videoId, this.currentlyPlaying.duration, this.currentlyPlaying.title, this.currentlyPlaying.thumbnail, false);
						}
						this.cdr.detectChanges();
					});
				});
			} else {
				$('.loader-container').css({display: 'none'});
				$('.channel-results-container').css({display: 'none'});
				$('.playlist-items-container').css({display: 'block'});
				console.error('setUpPlaylists', 404);
				$('.playlist-items-container').html(`
					<div class='container'>
						No playlists were found under this account or channel.
						Create one on <a href='https://www.youtube.com' style='color: ${THIRD_COLOR}'>YouTube</a> and it will show up here
					</div>
					<style>
						.container {padding: 20px 220px; text-align: center;}
						@media screen and (max-width: 768px) {.container {padding: 20px 8px;}}
						@media screen and (max-width: 425px) {.container {padding: 20px 22px;}}
					</style>
				`);
			}
		});
	}

	async getAllPlaylists(channelId) {
		try {
			let params;
			if (channelId != '') {
				params = {
					part: "snippet,contentDetails",
					channelId: channelId,
					maxResults: 30
				};
			} else {
				params = {
					part: "snippet,contentDetails",
					mine: true,
					maxResults: 30
				};
			}
			await gapi.client.request({
				method: 'GET',
				path: '/youtube/v3/playlists',
				params: params
			}).then((response) => {
				this.allPlaylists = response.result.items;
				// console.log('ALL PLAYLISTS', this.allPlaylists);
				localStorage.setItem('allPlaylists', JSON.stringify(this.allPlaylists));
			});
		} catch (err) {
			$('.loader-container').css({display: 'none'});
			$('.channel-results-container').css({display: 'none'});
			$('.playlist-items-container').css({display: 'block'});
			if (err.status == 404) {
				console.error('getAllPlaylists', err.status);
				$('.playlist-items-container').html(`
				 	<div class='container'>
						No playlists were found under this account or channel.
						Create one on <a href='https://www.youtube.com' style='color: ${THIRD_COLOR}'>YouTube</a> and it will show up here
					</div>
					<style>
						.container {padding: 20px 220px; text-align: center;}
						@media screen and (max-width: 768px) {.container {padding: 20px 8px;}}
						@media screen and (max-width: 425px) {.container {padding: 20px 22px;}}
					</style>
				`);
			} else if (err.status == 403) {
				this.displayErrorMsg();
			} else {
				console.error('getAllPlaylists', err.result.error.message);
			}
		}
	}

	async getPlaylistItems(playlistId) {
		try {
			await gapi.client.request({
				method: 'GET',
				path: '/youtube/v3/playlistItems',
				params: {
					part: "snippet,contentDetails",
					playlistId: playlistId,
					maxResults: 30
				}
			}).then((response) => {
				this.currentPlaylistItems = response.result.items;
				// console.log("CURRENT PLAYLIST ITEMS", this.currentPlaylistItems);
				localStorage.setItem('currentPlaylistItems', JSON.stringify(this.currentPlaylistItems));
			});
		} catch (err) {
			$('.loader-container').css({display: 'none'});
			$('.channel-results-container').css({display: 'none'});
			$('.playlist-items-container').css({display: 'block'});
			if (err.status == 403) {
				this.displayErrorMsg();
			} else {
				console.error('getPlaylistItems', err.status);
			}
		}
	}

	changePlaylist(playlistId) {
		$('.search-bar').val('');
		if (playlistId != this.currentPlaylist.id) {
			let len = this.allPlaylists.length;
			let lenBy2 = Math.round(len/2);
			for (let left = 0; left < lenBy2; left++) { // faster to iterate from both ends of the list until it meets in the middle
				let right = (len - 1) - left;
				let temp: any = null;
				if (this.allPlaylists[left].id == playlistId) {
					temp = this.allPlaylists[left];
				} else if (this.allPlaylists[right].id == playlistId) {
					temp = this.allPlaylists[right];
				}
				if (temp) {
					this.currentPlaylist = temp;
					// console.log('CURRENT PLAYLIST:', this.currentPlaylist.snippet.title);
					localStorage.setItem('currentPlaylist', JSON.stringify(this.currentPlaylist));
					$('.all-playlists-dropdown-button').html(`
						<div class='no-overflow'>${this.currentPlaylist.snippet.title}<div>
						<style>
							.no-overflow {text-overflow: ellipsis; overflow: hidden; white-space: nowrap;}
						</style>
					`);
					$('.all-playlists-dropdown-button').css({display: 'flex'});
					$('.channel-results-container').css({display: 'none'});
					$('.playlist-items-container').css({display: 'none'});
					$('.loader-container').css({display: 'block'});
					this.cdr.detectChanges();
					$(`#${this.currentPlaylistId}`).css({color: 'white'});
					$(`#${this.currentPlaylist.id}`).css({color: 'grey'});
					this.currentPlaylistId = this.currentPlaylist.id;
					this.getPlaylistItems(this.currentPlaylist.id).then(() => {
						this.setDurationsAndArtists().then(()=> {
							$('.loader-container').css({display: 'none'});
							$('.playlist-items-container').css({display: 'block'});
							this.cdr.detectChanges();
						});
					});
					break;
				}
			}
		} else { // for case where user searches for channels but wants to return to playlist
			$('.channel-results-container').css({display: 'none'});
			$('.playlist-items-container').css({display: 'block'});
		}
	}

	async setDurationsAndArtists(){
		try {
			for (let i = 0, len = this.currentPlaylistItems.length; i < len; i++) {
				await gapi.client.request({
					method: 'GET',
					path: '/youtube/v3/videos',
					params: {
						part: "snippet,contentDetails",
						id: this.currentPlaylistItems[i].contentDetails.videoId
					}
				}).then((response) => {
					if (this.currentPlaylistItems[i].snippet.title == 'Private video') { // in case of deleted video
						this.currentPlaylistItems[i].snippet.title = 'Deleted';
						this.currentPlaylistItems[i].snippet.thumbnails = {high: {url: null}};
						this.currentPlaylistItems[i].contentDetails.duration = 'PT0S';
					} else {
						this.currentPlaylistItems[i].snippet.title = this.currentPlaylistItems[i].snippet.title.concat('___' + response.result.items[0].snippet.channelTitle);
						this.currentPlaylistItems[i].contentDetails.duration = response.result.items[0].contentDetails.duration;
					}
				});
			}
		} catch (err) {
			$('.loader-container').css({display: 'none'});
			$('.channel-results-container').css({display: 'none'});
			$('.playlist-items-container').css({display: 'block'});
			if (err.status == 403) {
				this.displayErrorMsg();
			} else {
				console.error('setDurationsAndArtists', err);
			}
		}
	}

	async getChannels(query) {
		if (query) {
			try {
				await gapi.client.request({
					method: 'GET',
					path: '/youtube/v3/search',
					params: {
						part: "snippet",
						type: "channel",
						q: query,
						maxResults: 5
					}
				}).then((response) => {
					this.channelResults = response.result.items;
					$('.playlist-items-container').css({display: 'none'});
					$('.channel-results-container').css({display: 'block'});
					$('.channel-results').html(`${this.channelResults.length} channels found`);
				});
			} catch (err) {
				if (err.status == 403) {
					this.displayErrorMsg();
				} else {
					console.error('getChannels', err.status);
				}
			}
		} else {
			alert('Enter a channel name first!!');
		}
	}

	getPlaylistByChannelId(channelId) {
		localStorage.setItem('channelId', channelId);
		this.setChannelInfo(channelId).then(() => {
			localStorage.setItem('currentlyPlaying', '');
			localStorage.setItem('allPlaylists', '');
			localStorage.setItem('currentPlaylist', '');
			localStorage.setItem('currentPlaylistItems', '');
			if (this.GoogleAuth.isSignedIn.get() && confirm("You're about to logout!!")) {
				this.GoogleAuth.signOut();
			}
			window.location.reload();
		});
	}

	async setChannelInfo(channelId) {
		try {
			await gapi.client.request({
				method: 'GET',
				path: '/youtube/v3/channels',
				params: {
					part: "snippet,contentDetails",
					id: channelId
				}
			}).then((response) => {
				localStorage.setItem('channelTitle', response.result.items[0].snippet.title);
				localStorage.setItem('channelThumbnail', response.result.items[0].snippet.thumbnails.default.url);
			});
		} catch (err) {
			if (err.status == 403) {
				this.displayErrorMsg();
			} else {
				console.error('setChannelInfo', err.status);
			}
		}
	}

	formatTitle(title) {
		let split = title.split('___');
		return split[0];
	}

	formatArtist(title) {
		let split = title.split('___');
		return split[1];
	}

	checkLength(str) {
		let ret = str, len = 80;
		if (screen.width < 425 && str.length > len) {
			ret = str.substring(0, len) + '...';
		}
		return ret;
	}

	/**
	 * Builds the Audio Player
	 */
	buildAudioPlayer(videoId, videoDuration, title, thumbnail, autoplay) {
		if (this.currentlyPlaying.videoId != videoId || (this.currentlyPlaying.videoId != "" && this.justLoaded)) {
			if (this.justLoaded) { this.justLoaded = !this.justLoaded; }
			$('.playlist-items-container').css({'padding-bottom': '100px'});
			$('.channel-results-container').css({'padding-bottom': '100px'});

			const loopIcon = `<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="21" height="21" viewBox="0 0 225 225" style="fill:#000000;">
										<g fill="none" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt"
										stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0"
										font-family="none" font-weight="none" font-size="none" text-anchor="none" style="mix-blend-mode: normal">
											<path d="M0,225.99538v-225.99538h225.99538v225.99538z" fill="none"></path>
											<g id='loop-icon-color' fill="#ffffff">
												<path d="M140.76563,23.76563l-22.5,22.5l-3.09375,3.23438l3.09375,3.23438l22.5,22.5l6.46875,-6.46875l-14.76562,-14.76562h43.03125c5.02735,0 9,3.97266 9,9v99c0,5.02735 -3.97265,9 -9,9h-54v9h54c9.89649,0 18,-8.10351 18,-18v-99c0,-9.89649 -8.10351,-18 -18,-18h-43.03125l14.76563,-14.76562zM49.5,45c-9.89649,0 -18,8.10351 -18,18v99c0,9.89649 8.10351,18 18,18h43.03125l-14.76562,14.76563l6.46875,6.46875l22.5,-22.5l3.09375,-3.23437l-3.09375,-3.23437l-22.5,-22.5l-6.46875,6.46875l14.76563,14.76563h-43.03125c-5.02734,0 -9,-3.97265 -9,-9v-99c0,-5.02734 3.97266,-9 9,-9h54v-9z"></path>
											</g>
										</g>
									</svg>`;
			$(`.audio-player-placeholder`).html(`
				<div id="${videoId}-placeholder" style="display: none;"></div>
				<div class='audio-player-container'>
					<div class='thumbnail-container'><img class='thumbnail' src="${thumbnail}"></div>
					<div class='main-section'>
						<div class='title'>${this.formatTitle(title)}</div>
						<div class='artist'>${this.formatArtist(title)}</div>
						<div class='progress-bar'><input class='slider' id="${videoId}-progress-bar" type="range"></div>
						<div class='time-container'>
							<div class='current-time' id="${videoId}-current-time"></div>
							<div class='duration' id="${videoId}-duration"></div>
						</div>
						<div class='buttons-container'>
							<div class='shuffle' id="${videoId}-shuffle"><i class='fa fa-random'></i></div>
							<div class='previous' id="${videoId}-previous"><i class='fa fa-fast-backward'></i></div>
							<div class='play' id="${videoId}-play"><i class='fa fa-play'></i></div>
							<div class='pause' id="${videoId}-pause" style='display: none;'><i class='fa fa-pause'></i></div>
							<div class='next' id="${videoId}-next"><i class='fa fa-fast-forward'></i></div>
							<div class='loop' id="${videoId}-loop">${loopIcon}</div>
						</div>
					</div>
				</div>
				<style>
					.audio-player-container {
						display: flex;
						padding: 0 30%;
						color: white;
						position: fixed;
						left: 0;
						right: 0;
						bottom: 0;
						height: 100px;
						background-color: #202020e6;
					}
					.thumbnail-container {
						width: 19%;
					}
					.thumbnail {
						width: 100%;
						height: 100px;
					}
					.main-section {
						width: 81%;
						text-align: center;
						padding: 4px 14px;
					}
					.title {
						padding: 0 10px;
						width: 100%;
						overflow: hidden;
						white-space: nowrap;
						text-overflow: ellipsis;
					}
					.artist {
						line-height: 18px;
						color: ${THIRD_COLOR};
					}
					.progress-bar {
						background-color: inherit;
						height: 15px;
						padding: 0 1.5px;
					}
					.slider {
						-webkit-appearance: none;
						width: 100%;
						height: 3px;
						background: #d3d3d3;
						outline: none;
						opacity: 0.8;
						-webkit-transition: .2s;
						transition: opacity .2s;
					}
					.slider:hover {
						opacity: 1;
					}
					.slider::-webkit-slider-thumb {
						-webkit-appearance: none;
						appearance: none;
						width: 13px;
						height: 13px;
						border-radius: 50%;
						background: white;
						cursor: pointer;
					}
					.time-container {
						display: flex;
						justify-content: space-between;
						font-size: 12px;
						line-height: 12px;
					}
					.buttons-container {
						display: flex;
						justify-content: space-between;
						line-height: 20px;
						padding: 0 20%;
					}
					.play, .pause {
						font-size: 20px;
						line-height: 20px;
					}
					.play i:hover, .pause i:hover, .previous i:hover, .next i:hover, .shuffle i:hover, .loop svg:hover {
						cursor: pointer;
					}
					.previous, .next, .shuffle {
						font-size: 16px;
						padding: 1px 0;
						line-height: 20px;
					}
					@media screen and (max-width: 1024px) {
						.audio-player-container {
							padding: 0 20%;
						}
					}
					@media screen and (max-width: 768px) {
						.audio-player-container {
							padding: 0 10%;
						}
					}
					@media screen and (max-width: 425px) {
						.audio-player-container {
							padding: 0;
						}
						.main-section {
							width: 76%;
						}
						.thumbnail-container {
							width: 24%;
						}
						.buttons-container {
							padding: 0 15%;
						}
					}
				</style>
			`);

			if (this.YOUTUBE_PLAYER) {
				clearInterval(this.timer); // clear the timer of the previous song
			}

			this.currentEndTime = this.convertToSeconds(moment.duration(videoDuration).format('h:mm:ss').padStart(4, '0:0'));
			// console.log(videoDuration);

			this.YOUTUBE_PLAYER = new YT.Player(`${videoId}-placeholder`, { // ${videoId}-placeholder is the element id
				width: 0,
				height: 0,
				videoId: videoId,
				playerVars: { // Supported player params can be found at https://developers.google.com/youtube/player_parameters#Parameter
					start: 0,
					end: this.currentEndTime,
					enablejsapi: 1
				},
				events: {
					onReady: () => this.initialize(this.YOUTUBE_PLAYER, `#${videoId}-play`, `#${videoId}-pause`, `#${videoId}-previous`,
															`#${videoId}-next`, `#${videoId}-progress-bar`, `#${videoId}-current-time`, `#${videoId}-duration`,
															`#${videoId}-shuffle`, `#${videoId}-loop`, autoplay),
					onStateChange: this.onPlayerStateChange.bind(this)
				}
			});

			$(`.currently-playing-title`).html(`${title}`);
			if (this.loopEnabled) {
				$(`#loop-icon-color`).css({'fill': THIRD_COLOR});
			} else if (this.shuffleEnabled) {
				$(`#${videoId}-shuffle`).css({'color': THIRD_COLOR});
			}
			if (this.currentlyPlaying.videoId != '') {
				$(`#${this.currentlyPlaying.videoId}-row-container`).removeClass('active');
				this.previousSong.videoId = this.currentlyPlaying.videoId;
				this.previousSong.duration = this.currentlyPlaying.duration;
				this.previousSong.title = this.currentlyPlaying.title;
				this.previousSong.thumbnail = this.currentlyPlaying.thumbnail;
			}
			this.currentlyPlaying.videoId = videoId;
			this.currentlyPlaying.duration = videoDuration;
			this.currentlyPlaying.title = title;
			this.currentlyPlaying.thumbnail = thumbnail;
			$(`#${this.currentlyPlaying.videoId}-row-container`).addClass('active');
			localStorage.setItem('currentlyPlaying', JSON.stringify(this.currentlyPlaying));
			this.cdr.detectChanges();
		}
	}

	/**
	 * listens to player events
	 */
	onPlayerStateChange(event) {
		if (event.data == YT.PlayerState.PAUSED) {
			$(`#${this.currentlyPlaying.videoId}-pause`).css({"display": 'none'});
			$(`#${this.currentlyPlaying.videoId}-play`).css({"display": 'inline-block'});
		} else if (event.data == YT.PlayerState.PLAYING) {
			$(`#${this.currentlyPlaying.videoId}-play`).css({"display": 'none'});
			$(`#${this.currentlyPlaying.videoId}-pause`).css({"display": 'inline-block'});
		} else if (event.data == YT.PlayerState.ENDED) {
			$(`#${this.currentlyPlaying.videoId}-pause`).css({"display": 'none'});
			$(`#${this.currentlyPlaying.videoId}-play`).css({"display": 'inline-block'});
			if (this.loopEnabled) {
				this.YOUTUBE_PLAYER.seekTo(0);
			} else if (this.shuffleEnabled) {
				const randomIndex = Math.floor(Math.random() * Math.floor(this.currentPlaylistItems.length));
				this.buildAudioPlayer(this.currentPlaylistItems[randomIndex].contentDetails.videoId,
											this.currentPlaylistItems[randomIndex].contentDetails.duration,
											this.currentPlaylistItems[randomIndex].snippet.title,
											this.currentPlaylistItems[randomIndex].snippet.thumbnails.high.url, true);
			} else {
				for (let i = 0, len = this.currentPlaylistItems.length; i < len; i++) {
					if (this.currentPlaylistItems[i].contentDetails.videoId == this.currentlyPlaying.videoId
						&& i == this.currentPlaylistItems.length - 1) {
						this.buildAudioPlayer(this.currentPlaylistItems[0].contentDetails.videoId,
							this.currentPlaylistItems[0].contentDetails.duration,
							this.currentPlaylistItems[0].snippet.title,
							this.currentPlaylistItems[0].snippet.thumbnails.high.url, true);
						break;
					} else if (this.currentPlaylistItems[i].contentDetails.videoId == this.currentlyPlaying.videoId) {
						this.buildAudioPlayer(this.currentPlaylistItems[i+1].contentDetails.videoId,
													this.currentPlaylistItems[i+1].contentDetails.duration,
													this.currentPlaylistItems[i+1].snippet.title,
													this.currentPlaylistItems[i+1].snippet.thumbnails.high.url, true);
						break;
					}
				}
			}
		}
	}

	/**
	 * Initializes all functions for audio player.
	 */
	initialize(playerObj, playElId, pauseElId, previousElId, nextElId, progressBarElId, currentTimeElId, durationElId, shuffleElId, loopElId, autoplay) {
		$(playElId).children().on('click', () => { // play button click handler
			playerObj.getPlayerState() === 0 // 0 means song 'ended'
				? playerObj.seekTo(this.currentEndTime) // re-play if ended
				: null;
			playerObj.playVideo();
			this.playing = !this.playing;
		});

		$(pauseElId).children().on('click', () => { // pause button click handler
			playerObj.pauseVideo();
			this.playing = !this.playing;
		});

		document.body.onkeydown = (e) => { // space-bar click handler
			if (e.keyCode == 32 && document.activeElement !== $('.search-bar')[0]) { // space-bar and not focused on search bar
				e.preventDefault(); // disable default attributes on space-bar
				if (this.playing) {
					playerObj.pauseVideo();
					this.playing = !this.playing;
				} else {
					playerObj.getPlayerState() === 0 // a state of 0 means 'ended'
						? playerObj.seekTo(0)
						: null;
					playerObj.playVideo();
					this.playing = !this.playing;
				}
			}
		};

		$(previousElId).children().on('click', () => { // previous button click handler
			if (this.previousSong.videoId != '') {
				this.buildAudioPlayer(this.previousSong.videoId, this.previousSong.duration, this.previousSong.title, this.previousSong.thumbnail, true);
			} else {
				playerObj.seekTo(0);
			}
		});

		$(nextElId).children().on('click', () => { // next button click handler
			if (this.shuffleEnabled) {
				const randomIndex = Math.floor(Math.random() * Math.floor(this.currentPlaylistItems.length));
				this.buildAudioPlayer(this.currentPlaylistItems[randomIndex].contentDetails.videoId,
										this.currentPlaylistItems[randomIndex].contentDetails.duration,
										this.currentPlaylistItems[randomIndex].snippet.title,
										this.currentPlaylistItems[randomIndex].snippet.thumbnails.high.url, true);
			} else {
				for (let i = 0, len = this.currentPlaylistItems.length; i < len; i++) {
					if (this.currentPlaylistItems[i].contentDetails.videoId == this.currentlyPlaying.videoId && i == this.currentPlaylistItems.length - 1) {
						this.buildAudioPlayer(this.currentPlaylistItems[0].contentDetails.videoId,
							this.currentPlaylistItems[0].contentDetails.duration,
							this.currentPlaylistItems[0].snippet.title,
							this.currentPlaylistItems[0].snippet.thumbnails.high.url, true);
						break;
					} else if (this.currentPlaylistItems[i].contentDetails.videoId == this.currentlyPlaying.videoId) {
						this.buildAudioPlayer(this.currentPlaylistItems[i+1].contentDetails.videoId,
													this.currentPlaylistItems[i+1].contentDetails.duration,
													this.currentPlaylistItems[i+1].snippet.title,
													this.currentPlaylistItems[i+1].snippet.thumbnails.high.url, true);
						break;
					}
				}
			}
		});

		$(shuffleElId).children().on('click', () => { // shuffle button click handler
			if (!this.shuffleEnabled) {
				$(shuffleElId).css({'color': 'grey'});
				if (this.loopEnabled) {
					$(`#loop-icon-color`).css({'fill': 'white'});
					this.loopEnabled = !this.loopEnabled;
				}
			} else {
				$(shuffleElId).css({'color': 'white'});
			}
			this.shuffleEnabled = !this.shuffleEnabled;
		});

		$(loopElId).children().on('click', () => { // loop button click handler
			if (!this.loopEnabled) {
				$('#loop-icon-color').css({'fill': 'grey'});
				if (this.shuffleEnabled) {
					$(shuffleElId).css({'color': 'white'});
					this.shuffleEnabled = !this.shuffleEnabled;
				}
			} else {
				$('#loop-icon-color').css({'fill': 'white'});
			}
			this.loopEnabled = !this.loopEnabled;
		});

		$(progressBarElId) // Set min/max values for progress bar & set mouseup and touchend handlers
			.attr('min', 0)
			.attr('max', this.currentEndTime)
			.on('mouseup touchend', (e) => playerObj.seekTo(e.target.value));

		$(currentTimeElId).text("0:00");
		$(durationElId).text(this.formatTime(this.currentEndTime));
		$(progressBarElId).val(0); // initially set to 0:00

		if (autoplay) {
			playerObj.playVideo();
		}

		this.timer = setInterval(() => { // Creates interval for updating progress bar and current time
			this.doUpdate(currentTimeElId, progressBarElId, playerObj);
		}, 1000);

		setTimeout(() => { // clear any auto-resume checkpoint on the video
			if (playerObj.getCurrentTime() > 0) {
				playerObj.seekTo(0);
			}
		}, 1000);
	}

	/**
	 * Updates current_time / duration
	 * Updates progress_bar
	 */
	doUpdate(currentTimeElId, progressBarElId, playerObj) {
		this.updateTimerDisplay(currentTimeElId, playerObj);
		this.updateProgressBar(progressBarElId, playerObj);
	}

	/**
	 * Updates current_time / duration
	 */
	updateTimerDisplay(currentTimeElId, playerObj) {
		$(currentTimeElId).text(this.formatTime(playerObj.getCurrentTime()));
	}

	/**
	 * Updates progress bar
	 */
	updateProgressBar(progressBarElId, playerObj) {
		$(progressBarElId).val(playerObj.getCurrentTime());
	}

	/**
	 * Formats time in xx:xx(:xx) format
	 * @param time in seconds
	 */
	formatTime(time) {
		let seconds, minutes, hours, ret;
		time = Math.round(time);
		if (time >= 3600) {
			hours = Math.floor(time / 3600);
			minutes = Math.floor((time - hours * 3600) / 60);
			seconds = time - (minutes * 60 + hours * 3600);
			minutes = minutes < 10 ? "0" + minutes.toString() : minutes.toString();
			seconds = seconds < 10 ? "0" + seconds.toString() : seconds.toString();
			ret = hours.toString() + ":" + minutes + ":" + seconds; // case of xx:xx:xx
		} else {
			minutes = Math.floor(time / 60),
			seconds = time - minutes * 60;
			seconds = seconds < 10 ? "0" + seconds.toString() : seconds.toString();
			ret = minutes.toString() + ":" + seconds; // case of xx:xx
		}
		return ret;
	}

	/**
	 * Converts time from xx:xx(:xx) format to seconds
	 */
	convertToSeconds(time) {
		let split = time.toString().split(":"), ret;
		if (split.length == 2) {
			ret = Number((Number(split[0]) * 60 + Number(split[1])).toFixed(3)); // case of xx:xx
		} else {
			ret = Number((Number(split[0]) * 3600 + Number(split[1]) * 60 + Number(split[2])).toFixed(3)); // case of xx:xx:xx
		}
		return ret;
	}
}
