# Product Overview

## UGC Ad Creator API

A Node.js RESTful API server that generates User Generated Content advertisements from creative briefs and images. The system processes multiple images, analyzes content using AI vision, generates or refines video scripts, and produces final video content through an integrated AI workflow.

## Core Functionality

- **Multi-image Upload**: Accept up to configurable maximum images (PNG, JPG, JPEG)
- **AI-Powered Analysis**: Analyze images to identify objects, people, settings, and actions
- **Script Generation**: Create 2-segment video scripts (7-8 seconds each) using OpenAI
- **Script Refinement**: Optionally refine user-provided scripts based on image analysis
- **Video Generation**: Generate videos using Kie AI VEO3 API and merge segments
- **RESTful Interface**: Clean HTTP API with structured JSON responses

## Target Users

Developers integrating UGC ad generation capabilities into marketing platforms, content management systems, or advertising tools.

## Key Value Proposition

Transforms static creative briefs and images into dynamic video advertisements through an automated AI-powered workflow, reducing manual video production time and costs.