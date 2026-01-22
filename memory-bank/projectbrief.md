Project Overview

Graphical user interface for camillaDSP

Project: LAN-hosted GUI to manage camillaDSP hosted on low power devices.

This project is a LAN-hosted, browser-based interactive GUI for camillaDSP, intended to run entirely on a local network device. It provides a real-time, visual, and interactive  interface that allows users to manipulate audio parameters with immediate feedback. 

The interface will feature the following web pages: 
	•	a page to establish a connection with the camillaDSP service
	•	a page lo load predefined EQ curves from a list.	
	•	a graphical EQ curve editor where users can adjust multiple EQ bands and immediately hear and see the results.
	•	a multi-channel pipeline editor to manage the audio processing chain.

Core Goals
	•	Provide an interactive parametric equalizer UI accessible via a web browser
	•	Operate entirely on a local network (no cloud dependencies)
	•	Support real-time audio processing and visualization
	•	Maintain low latency suitable for live audio adjustment
	•	Be robust, deterministic, and predictable in behavior

High-Level Requirements
	•	LAN-hosted web application
	•	Real-time parametric EQ with multiple bands
	•	Interactive graphical EQ curve editing
	•	Visual feedback of frequency response
	•	Multi-channel pipeline editor	
	•	Deterministic startup, shutdown, and error behavior
