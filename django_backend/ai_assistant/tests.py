"""Automated tests for AI Policy Assistant, Document Summarizer & RAG Claims Triage."""

from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization


class AIAssistantAPITests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.organization = Organization.objects.create(
            name='AI Test Syndicate',
            slug='ai-test-syndicate',
            naic_company_code='NAIC-AI-TEST',
        )
        self.user = User.objects.create_user(
            email='ai-underwriter@insuresphere.ai',
            password='StrongAIPassword2026!',
            name='Elena Underwriter',
            role='Admin',
            organization=self.organization,
        )
        self.url = '/api/ai/analyze-document/'

    def test_unauthenticated_request_rejected(self):
        """Unauthenticated requests to AI analysis endpoint must return 401 Unauthorized."""
        response = self.client.post(self.url, {'mode': 'rag_qa'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_claim_analysis_mode_evaluates_net_exposure_and_treaty_recovery(self):
        """claim_analysis evaluates loss vs deductible and calculates 40% reinsurance recovery."""
        self.client.force_authenticate(user=self.user)
        payload = {
            'mode': 'claim_analysis',
            'claimContext': {
                'claimNumber': 'CLM-2026-8841',
                'amount': 240000,
                'customerName': 'Apex Logistics',
                'type': 'Commercial Property',
            },
            'policyContext': {
                'policyNumber': 'POL-COM-9012',
                'deductible': 50000,
            },
        }

        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertIn('analysis', data)
        analysis = data['analysis']
        self.assertIn('summary', analysis)
        self.assertIn('coverageAssessment', analysis)
        self.assertIn('reinsuranceImpact', analysis)
        self.assertIn('humanReviewerChecklist', analysis)
        # Net loss: $240,000 - $50,000 = $190,000. 40% cession = $76,000.
        self.assertIn('76,000', analysis['reinsuranceImpact'])
        self.assertTrue(len(analysis['humanReviewerChecklist']) >= 3)

    def test_explain_terms_mode_simplifies_policy_language(self):
        """explain_terms clarifies exclusions, co-insurance, and subrogation."""
        self.client.force_authenticate(user=self.user)
        payload = {
            'mode': 'explain_terms',
            'documentText': 'Clause 12: Subrogation and deductible application schedule.',
        }

        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        analysis = response.data['analysis']

        self.assertIn('financial responsibility', analysis['summary'].lower())
        self.assertIn('subrogation', analysis['reinsuranceImpact'].lower())
        self.assertIn('riskIndicators', analysis)

    def test_rag_qa_mode_answers_coverage_inquiries(self):
        """rag_qa synthesizes answers for specific underwriting or claims questions."""
        self.client.force_authenticate(user=self.user)
        question = 'What is the waiting period for business interruption?'
        payload = {
            'mode': 'rag_qa',
            'question': question,
            'documentText': 'Section 4: Business Interruption carries a 72-hour waiting period.',
        }

        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        analysis = response.data['analysis']

        self.assertIn(question, analysis['summary'])
        self.assertIn('72 hours', analysis['coverageAssessment'])

    @patch.dict('os.environ', {'GEMINI_API_KEY': 'mock_valid_api_key_for_testing'})
    def test_gemini_api_integration_mock(self):
        """Mocks Gemini SDK generation and parses structured response."""
        self.client.force_authenticate(user=self.user)
        mock_response = MagicMock()
        mock_response.text = (
            '{"summary": "Gemini RAG response", "coverageAssessment": "Covered up to $10M", '
            '"riskIndicators": ["High wind risk"], "reinsuranceImpact": "40% treaty recovery", '
            '"humanReviewerChecklist": ["Verify roof photos"]}'
        )

        with patch('google.genai.Client') as MockClient:
            mock_instance = MockClient.return_value
            mock_instance.models.generate_content.return_value = mock_response

            payload = {'mode': 'rag_qa', 'question': 'Is wind damage covered?'}
            response = self.client.post(self.url, payload, format='json')

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['source'], 'django-gemini-rag')
            self.assertEqual(response.data['analysis']['summary'], 'Gemini RAG response')
